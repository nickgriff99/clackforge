import { Prisma, type Order } from "@prisma/client"
import express, { Router } from "express"
import type Stripe from "stripe"
import { env } from "../config/env"
import { prisma } from "../db/prisma"
import { sendOrderConfirmationEmail } from "../lib/email"
import { logger } from "../lib/logger"
import { getStripeClient } from "../lib/stripe"

export const webhooksRouter = Router()

const WEBHOOK_PATH = "/api/webhooks/stripe"

// This raw-body parser must apply to only this one path, and this whole
// router must be mounted in src/app.ts before the app-wide express.json()
// call. `stripe.webhooks.constructEvent` needs the exact original byte
// stream to verify the signature - if express.json() ran first, the body
// would already be parsed/re-serialized and every signature check would
// fail.
webhooksRouter.use(WEBHOOK_PATH, express.raw({ type: "application/json" }))

function getLineKind(li: Stripe.LineItem): string | undefined {
  const product = li.price?.product
  if (product && typeof product === "object" && !("deleted" in product && product.deleted)) {
    return (product as Stripe.Product).metadata?.kind
  }
  return undefined
}

function getLineMetadata(li: Stripe.LineItem): Stripe.Metadata | undefined {
  const product = li.price?.product
  if (product && typeof product === "object" && !("deleted" in product && product.deleted)) {
    return (product as Stripe.Product).metadata
  }
  return undefined
}

webhooksRouter.post(WEBHOOK_PATH, async (req, res) => {
  const stripe = getStripeClient()
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    // Owner hasn't supplied real Stripe keys/webhook secret yet - can't
    // verify a signature against a secret we don't have. 503 so Stripe
    // retries later once real keys are configured, not a crash.
    logger.warn("stripe_webhook_received_unconfigured")
    res.status(503).send("Stripe webhook is not configured")
    return
  }

  const signature = req.headers["stripe-signature"]
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing Stripe-Signature header")
    return
  }

  let event: Stripe.Event
  try {
    // req.body is the raw Buffer here - see the express.raw() mount above.
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    logger.warn("stripe_webhook_signature_invalid", { message: err instanceof Error ? err.message : String(err) })
    res.status(400).send("Invalid signature")
    return
  }

  // Step 1: only checkout.session.completed is acted on. Everything else: 200 no-op.
  if (event.type !== "checkout.session.completed") {
    res.status(200).send("ignored")
    return
  }

  const session = event.data.object as Stripe.Checkout.Session
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id

  if (!paymentIntentId) {
    logger.error("stripe_webhook_missing_payment_intent", { sessionId: session.id })
    res.status(200).send("ignored: no payment_intent on session")
    return
  }

  // Step 2: idempotency fast-path - Stripe retry of an already-processed event.
  const existingOrder = await prisma.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId } })
  if (existingOrder) {
    res.status(200).send("already processed")
    return
  }

  const userId = session.metadata?.userId
  const cartId = session.metadata?.cartId
  if (!userId || !cartId) {
    logger.error("stripe_webhook_missing_metadata", { sessionId: session.id })
    res.status(200).send("ignored: missing userId/cartId metadata")
    return
  }

  // Step 3: reconstruct order items from STRIPE's own stored line items (NOT
  // the local CartItem table - the cart may have changed since session
  // creation), using each line's metadata.kind to separate real product
  // lines from the synthetic shipping/tax lines.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ["data.price.product"],
  })

  interface PendingOrderItem {
    productId: string
    variantId: string | null
    customBuildId: string | null
    name: string
    unitPrice: number
    quantity: number
    lineTotal: number
  }

  const orderItems: PendingOrderItem[] = []
  let shippingTotal = 0
  let taxTotal = 0

  for (const li of lineItems.data) {
    const kind = getLineKind(li)
    const amount = li.amount_total ?? 0

    if (kind === "shipping") {
      shippingTotal += amount
      continue
    }
    if (kind === "tax") {
      taxTotal += amount
      continue
    }

    // kind === "line" (or unset/unexpected - treated defensively as a real
    // product line rather than silently dropped, since dropping a paid line
    // would under-bill the order record relative to what was charged).
    const metadata = getLineMetadata(li)
    const quantity = li.quantity ?? 1
    orderItems.push({
      productId: metadata?.productId || "",
      variantId: metadata?.variantId || null,
      customBuildId: metadata?.customBuildId || null,
      name: li.description ?? "Item",
      unitPrice: li.price?.unit_amount ?? Math.round(amount / quantity),
      quantity,
      lineTotal: amount,
    })
  }

  const subtotal = orderItems.reduce((sum, i) => sum + i.lineTotal, 0)
  // Use Stripe's own authoritative charged total, not a re-derived sum.
  const total = session.amount_total ?? subtotal + shippingTotal + taxTotal
  const orderNumber = `CF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  let createdOrder: Order | null = null

  try {
    // Step 4: one transaction - create Order+OrderItems, decrement variant
    // stock for variant-backed lines only, clear the cart.
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          orderNumber,
          status: "PLACED",
          subtotal,
          tax: taxTotal,
          shipping: shippingTotal,
          total,
          currency: session.currency ?? "usd",
          stripePaymentIntentId: paymentIntentId,
          items: {
            create: orderItems.map((i) => ({
              productId: i.productId,
              variantId: i.variantId ?? undefined,
              customBuildId: i.customBuildId ?? undefined,
              name: i.name,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            })),
          },
        },
      })
      createdOrder = order

      // Component-variant decrementing for sold custom builds is an
      // explicit, documented gap (see the big comment in shared/src/api.ts
      // step 4) - only variant-backed lines decrement stock here.
      for (const item of orderItems) {
        if (item.variantId) {
          await tx.variant.update({ where: { id: item.variantId }, data: { stock: { decrement: item.quantity } } })
        }
      }

      // Convert any drop reservations attached to this cart's items into a
      // permanent sale before the cart is cleared below - once
      // `cartItem.deleteMany` runs, `DropReservation.cartItem` is
      // `onDelete: SetNull`, so the `cartItemId` link that identifies which
      // reservations belong to this checkout would be gone. `soldCount` is
      // the only place a drop reservation's stock becomes permanent
      // (schema.prisma's GroupBuyDrop doc comment: "soldCount only
      // increments when a reservation actually CONVERTS") - this is that
      // conversion. Scoped to `status: "ACTIVE"` so a webhook retry (caught
      // by the idempotency check above in the normal case, but defensive
      // here too) can't double-increment an already-CONVERTED reservation.
      const dropReservations = await tx.dropReservation.findMany({
        where: { status: "ACTIVE", cartItem: { cartId } },
      })
      for (const reservation of dropReservations) {
        await tx.dropReservation.update({ where: { id: reservation.id }, data: { status: "CONVERTED" } })
        await tx.groupBuyDrop.update({
          where: { id: reservation.dropId },
          data: { soldCount: { increment: reservation.quantity } },
        })
      }

      await tx.cartItem.deleteMany({ where: { cartId } })
    })
  } catch (err) {
    // Race backstop: a concurrent duplicate delivery can slip past the
    // check-first findUnique above; the unique constraint on
    // stripePaymentIntentId throws P2002 here instead. Only treat THAT
    // specific constraint as "already processed" - any other P2002 (e.g. an
    // orderNumber collision) is a real bug and should surface as a failure
    // so Stripe retries and it gets noticed, not silently swallowed.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes("stripePaymentIntentId")
    ) {
      logger.info("stripe_webhook_duplicate_race", { paymentIntentId })
      res.status(200).send("already processed (race)")
      return
    }

    logger.error("stripe_webhook_processing_failed", {
      message: err instanceof Error ? err.message : String(err),
      paymentIntentId,
    })
    res.status(500).send("webhook processing failed")
    return
  }

  // Step 5: ack 200 AFTER the transaction commits, THEN send the
  // confirmation email - a slow/failed send must never risk Stripe's
  // webhook timeout/retry.
  res.status(200).send("ok")

  const order: Order = createdOrder!
  void prisma.user
    .findUnique({ where: { id: userId } })
    .then((user) => {
      if (!user) return
      return sendOrderConfirmationEmail({
        to: user.email,
        displayName: user.displayName,
        orderNumber: order.orderNumber,
        total: order.total,
        currency: order.currency,
        items: orderItems,
      })
    })
    .catch((err) => {
      logger.error("order_confirmation_email_failed", {
        message: err instanceof Error ? err.message : String(err),
        orderNumber: order.orderNumber,
      })
    })
})
