import { ApiErrorSchema, calculateCartTotals, CheckoutSessionResponseSchema, type CartItemSnapshot } from "@shared"
import type { CustomBuild, DropReservation, Product, Variant } from "@prisma/client"
import { Router } from "express"
import type Stripe from "stripe"
import { env } from "../config/env"
import { prisma } from "../db/prisma"
import { logger } from "../lib/logger"
import { computeUnitPrice, deriveLineName } from "../lib/pricing"
import { getStripeClient } from "../lib/stripe"
import { requireAuth } from "../middleware/requireAuth"

export const checkoutRouter = Router()

type CartItemRow = {
  id: string
  productId: string
  variantId: string | null
  customBuildId: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  product: Product | null
  variant: Variant | null
  customBuild: CustomBuild | null
  // Present only for cart lines created by POST /api/drops/:slug/reserve
  // (DropReservation.cartItemId is @unique, 1:1 - see schema.prisma).
  // Normal shop/configurator lines are always null.
  dropReservation: DropReservation | null
}

/**
 * See the doc comment above `CheckoutSessionResponseSchema` in
 * shared/src/api.ts for the full procedure. No request body: this route
 * reads the user's DB cart and re-derives every price itself, so there is
 * nothing client-supplied to distrust.
 */
checkoutRouter.post("/api/checkout/session", requireAuth, async (req, res, next) => {
  try {
    // Stripe-configured gate is checked right before the actual Stripe call
    // below (not here) - deliberately after the EMPTY_CART/OUT_OF_STOCK
    // business checks, so those two error paths stay fully exercisable even
    // with no Stripe keys configured. Without real Stripe test-mode keys,
    // the route still fails closed with 500 INTERNAL_ERROR, never a crash
    // or a fake/unresolvable url.
    const stripe = getStripeClient()

    const user = req.user!
    const cart = await prisma.cart.findUnique({ where: { userId: user.id } })
    const rows: CartItemRow[] = cart
      ? await prisma.cartItem.findMany({
          where: { cartId: cart.id },
          include: { product: true, variant: true, customBuild: true, dropReservation: true },
        })
      : []

    // 1. 400 EMPTY_CART first.
    if (rows.length === 0) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Your cart is empty", code: "EMPTY_CART" } }))
      return
    }

    // 2. Re-fetch LIVE price for every line (never trust the stored
    //    CartItem.unitPrice snapshot) + 3. collect any out-of-stock lines.
    const refreshed: { row: CartItemRow; snapshot: CartItemSnapshot }[] = []
    const outOfStockLines: string[] = []
    const now = new Date()

    for (const row of rows) {
      // A drop-backed line's Product is deliberately `status: "DRAFT"`
      // (see prisma/seed.ts's dropSeed comment) - the normal
      // `product.status !== "ACTIVE"` check below would reject every drop
      // line unconditionally, which is wrong (a DRAFT drop product is a
      // legitimate, purchasable line as long as its reservation is still
      // ACTIVE and unexpired). Check the drop-specific expiry first and
      // `continue` before the generic ACTIVE-status gate ever runs for these
      // rows.
      if (row.dropReservation) {
        if (row.dropReservation.status !== "ACTIVE" || row.dropReservation.expiresAt <= now) {
          outOfStockLines.push(`${row.product?.name ?? row.productId} (drop reservation expired: remove and re-reserve)`)
          continue
        }
        // Reservation is live: this line is authorized regardless of the
        // linked Product's DRAFT status / Variant's always-zero stock (both
        // deliberately meaningless for drop inventory - see
        // schema.prisma's GroupBuyDrop doc comment). Price still comes from
        // computeUnitPrice below like every other line.
        if (!row.product) {
          outOfStockLines.push(row.productId)
          continue
        }
        const unitPrice = computeUnitPrice(row.product, row.variant, row.customBuild)
        const lineTotal = unitPrice * row.quantity
        refreshed.push({
          row,
          snapshot: {
            id: row.id,
            productId: row.productId,
            variantId: row.variantId ?? undefined,
            customBuildId: row.customBuildId ?? undefined,
            name: deriveLineName(row.product, row.variant, row.customBuild),
            quantity: row.quantity,
            unitPrice,
            lineTotal,
          },
        })
        continue
      }

      if (!row.product || row.product.status !== "ACTIVE") {
        outOfStockLines.push(row.variant?.name ?? row.product?.name ?? row.productId)
        continue
      }
      // Stock only exists on Variant (zero-variant products are always
      // orderable) - CustomBuild lines have no stock column either, out of
      // scope for this check.
      if (row.variant && row.variant.stock < row.quantity) {
        outOfStockLines.push(`${row.product.name} (${row.variant.name})`)
        continue
      }

      const unitPrice = computeUnitPrice(row.product, row.variant, row.customBuild)
      const lineTotal = unitPrice * row.quantity
      refreshed.push({
        row,
        snapshot: {
          id: row.id,
          productId: row.productId,
          variantId: row.variantId ?? undefined,
          customBuildId: row.customBuildId ?? undefined,
          name: deriveLineName(row.product, row.variant, row.customBuild),
          quantity: row.quantity,
          unitPrice,
          lineTotal,
        },
      })
    }

    if (outOfStockLines.length > 0) {
      res.status(409).json(
        ApiErrorSchema.parse({
          error: { message: `Not enough stock for: ${outOfStockLines.join(", ")}`, code: "OUT_OF_STOCK" },
        }),
      )
      return
    }

    // Persist the refreshed unitPrice/lineTotal back onto each CartItem row -
    // this IS the "server recalculates price, never trusts the client" step,
    // applied by re-deriving from the catalog (this route takes no body, so
    // there's nothing client-supplied to distrust in the first place).
    await Promise.all(
      refreshed
        .filter(({ row, snapshot }) => row.unitPrice !== snapshot.unitPrice || row.lineTotal !== snapshot.lineTotal)
        .map(({ row, snapshot }) =>
          prisma.cartItem.update({ where: { id: row.id }, data: { unitPrice: snapshot.unitPrice, lineTotal: snapshot.lineTotal } }),
        ),
    )

    // 4. Totals for the synthetic shipping/tax lines (same pure function the
    //    cart page already uses - never a second pricing rule).
    const totals = calculateCartTotals(refreshed.map((r) => r.snapshot))
    const currency = cart!.currency

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = refreshed.map(({ snapshot }) => ({
      price_data: {
        currency,
        unit_amount: snapshot.unitPrice,
        product_data: {
          name: snapshot.name,
          metadata: {
            kind: "line",
            productId: snapshot.productId,
            variantId: snapshot.variantId ?? "",
            customBuildId: snapshot.customBuildId ?? "",
          },
        },
      },
      quantity: snapshot.quantity,
    }))

    if (totals.estimatedShipping > 0) {
      lineItems.push({
        price_data: {
          currency,
          unit_amount: totals.estimatedShipping,
          product_data: { name: "Shipping", metadata: { kind: "shipping" } },
        },
        quantity: 1,
      })
    }
    if (totals.estimatedTax > 0) {
      lineItems.push({
        price_data: {
          currency,
          unit_amount: totals.estimatedTax,
          product_data: { name: "Estimated tax", metadata: { kind: "tax" } },
        },
        quantity: 1,
      })
    }

    if (!stripe) {
      res.status(500).json(ApiErrorSchema.parse({ error: { message: "Stripe is not configured", code: "INTERNAL_ERROR" } }))
      return
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // The installed `stripe` SDK (v23, API version 2026-09-30.endive) no
      // longer accepts `payment_method_types` on SessionCreateParams at
      // all - modern Stripe Checkout auto-offers whatever payment methods
      // are enabled in the Dashboard (Settings > Payment methods), "card"
      // on by default for a fresh account. Omitting the field achieves the
      // same test-mode card-only behavior without it.
      line_items: lineItems,
      success_url: `${env.CLIENT_ORIGIN}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_ORIGIN}/checkout`,
      customer_email: user.email,
      metadata: { userId: user.id, cartId: cart!.id },
    })

    if (!session.url) {
      // Shouldn't happen for mode: "payment" with these params - fail loud,
      // not silent, if Stripe ever returns a session with no hosted URL.
      logger.error("stripe_session_missing_url", { sessionId: session.id })
      res.status(500).json(ApiErrorSchema.parse({ error: { message: "Could not create a checkout session", code: "INTERNAL_ERROR" } }))
      return
    }

    res.status(200).json(CheckoutSessionResponseSchema.parse({ url: session.url }))
  } catch (err) {
    next(err)
  }
})
