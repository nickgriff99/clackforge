import {
  AddCartItemInputSchema,
  ApiErrorSchema,
  CartResponseSchema,
  MergeCartInputSchema,
  UpdateCartItemInputSchema,
  type CartItemSnapshot,
  type CartSnapshot,
} from "@shared"
import {
  Prisma,
  type Cart,
  type CartItem,
  type CustomBuild,
  type DropReservation,
  type Product,
  type Variant,
} from "@prisma/client"
import { Router, type Response } from "express"
import { prisma } from "../db/prisma"
import { computeUnitPrice, deriveLineName } from "../lib/pricing"
import { logger } from "../lib/logger"
import { requireAuth } from "../middleware/requireAuth"

export const cartRouter = Router()

// All cart-sync routes require a session. `requireAuth` is applied
// per-route below (not a blanket `.use()`) so unmatched paths that merely
// share this router's mount point still fall through to `notFoundHandler`
// instead of being intercepted here.

const CART_ITEM_INCLUDE = {
  product: true,
  variant: true,
  customBuild: true,
  // Lets the snapshot mapper below render a real group-buy hold
  // countdown/label instead of leaving these lines indistinguishable from
  // normal ones. Only ever present on lines created by
  // POST /api/drops/:slug/reserve (see CartItem.dropReservation's doc
  // comment in schema.prisma).
  dropReservation: { include: { drop: { select: { slug: true } } } },
} as const
type CartItemWithRefs = CartItem & {
  product: Product
  variant: Variant | null
  customBuild: CustomBuild | null
  dropReservation: (DropReservation & { drop: { slug: string } }) | null
}

function toSnapshotItem(item: CartItemWithRefs): CartItemSnapshot {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId ?? undefined,
    customBuildId: item.customBuildId ?? undefined,
    // See lib/pricing.ts's `deriveLineName` doc comment - LIVE derived name,
    // not a true DB snapshot (CartItem has no `name` column). unitPrice/
    // lineTotal below ARE real stored snapshots, read straight off the row -
    // only `name` has this gap.
    name: deriveLineName(item.product, item.variant, item.customBuild),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    // Defensive `status === "ACTIVE"` check (not just "relation present") -
    // by the time this runs, GET /api/cart's lazy sweep (below) has already
    // removed any naturally-expired line, but this mapper is also reused by
    // routes/drops.ts's reserve response, so don't assume the caller always
    // swept first.
    dropReservation:
      item.dropReservation && item.dropReservation.status === "ACTIVE"
        ? { expiresAt: item.dropReservation.expiresAt.toISOString(), dropSlug: item.dropReservation.drop.slug }
        : undefined,
  }
}

/**
 * Either the top-level `prisma` client or an in-transaction `tx` - both
 * expose the same `.cart`/`.cartItem` delegates. Exported and parameterized
 * so `routes/drops.ts`'s reserve-route transaction can find-or-create the
 * user's cart and build the response snapshot without reimplementing this
 * logic. Every call site in this file omits the second argument and keeps
 * using the top-level `prisma`.
 */
type CartDb = typeof prisma | Prisma.TransactionClient

/**
 * Find-or-create a user's Cart. `Cart.userId` is `@unique` (migration
 * 20261001060000_cart_user_unique) specifically so two near-simultaneous
 * first requests for the same user can't create two Cart rows - this is the
 * backstop for that race: a concurrent duplicate `create` throws Prisma
 * P2002 on the unique constraint, treated as "someone else just won the
 * race," not an error.
 */
export async function findOrCreateCart(userId: string, client: CartDb = prisma): Promise<Cart> {
  const existing = await client.cart.findUnique({ where: { userId } })
  if (existing) return existing

  try {
    return await client.cart.create({ data: { userId } })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await client.cart.findUnique({ where: { userId } })
      if (winner) return winner
    }
    throw err
  }
}

export async function getCartSnapshot(userId: string, client: CartDb = prisma): Promise<CartSnapshot> {
  const cart = await findOrCreateCart(userId, client)
  const rows = await client.cartItem.findMany({
    where: { cartId: cart.id },
    include: CART_ITEM_INCLUDE,
    orderBy: { createdAt: "asc" },
  })
  const items = rows.map(toSnapshotItem)
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)
  // Stamped fresh on every call, not cached - see CartSnapshotSchema's
  // `serverNow` doc comment in shared/src/cart.ts (clock-skew baseline for
  // `useCountdown`, same role as DropStateResponseSchema's own field).
  return { id: cart.id, currency: cart.currency, items, subtotal, serverNow: new Date().toISOString() }
}

/**
 * Lazy sweep for naturally-expired group-buy holds - mirrors drops.ts's own
 * opportunistic-expiry pattern (no cron in this codebase, schema.prisma's
 * GroupBuyDrop doc comment) but scoped to ONE user's own cart instead of one
 * drop's rows, since this runs on every `GET /api/cart` rather than inside a
 * drop-row lock. Nothing else ever sweeps a cart line whose linked
 * `DropReservation` aged past `expiresAt` without a LATER reserve attempt on
 * that same drop by someone else flipping it - this closes that gap.
 *
 * Returns the display names of any lines it removed, so the route can tell
 * the client which holds just got released (empty array = nothing to report).
 */
async function sweepExpiredDropReservations(userId: string, client: CartDb): Promise<string[]> {
  const cart = await findOrCreateCart(userId, client)
  const now = new Date()

  const expiredRows = await client.cartItem.findMany({
    where: { cartId: cart.id, dropReservation: { status: "ACTIVE", expiresAt: { lt: now } } },
    include: { product: true, variant: true, customBuild: true, dropReservation: true },
  })

  if (expiredRows.length === 0) return []

  const names = expiredRows.map((row) => deriveLineName(row.product, row.variant, row.customBuild))

  // Flip the reservation to EXPIRED before deleting its CartItem - same
  // ordering rule as the DELETE /api/cart/items/:id route's own comment:
  // `DropReservation.cartItem` is `onDelete: SetNull`, so a delete-first
  // order risks losing the link needed to target the right reservation
  // rows (not strictly hit here since we already resolved the ids via the
  // join above, but matching the established, reviewed order avoids
  // inventing a second convention for the same operation).
  await client.dropReservation.updateMany({
    where: { id: { in: expiredRows.map((row) => row.dropReservation!.id) } },
    data: { status: "EXPIRED" },
  })
  await client.cartItem.deleteMany({ where: { id: { in: expiredRows.map((row) => row.id) } } })

  return names
}

function notFound(res: Response, message: string): void {
  res.status(404).json(ApiErrorSchema.parse({ error: { message, code: "NOT_FOUND" } }))
}

// GET /api/cart - auto-creates an empty cart on first hit, never 404s. Also
// where the lazy drop-reservation-expiry sweep lives (see
// `sweepExpiredDropReservations`'s doc comment) - runs inside its own
// transaction, scoped to the CALLER's own cart only, before building the
// snapshot that transaction's deletes need to be reflected in.
cartRouter.get("/api/cart", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id
    const expiredLineNames = await prisma.$transaction((tx) => sweepExpiredDropReservations(userId, tx))
    const snapshot = await getCartSnapshot(userId)
    res.status(200).json(
      CartResponseSchema.parse({
        cart: snapshot,
        expiredLineNames: expiredLineNames.length > 0 ? expiredLineNames : undefined,
      }),
    )
  } catch (err) {
    next(err)
  }
})

// POST /api/cart/items
cartRouter.post("/api/cart/items", requireAuth, async (req, res, next) => {
  try {
    const input = AddCartItemInputSchema.parse(req.body)
    const userId = req.user!.id

    const product = await prisma.product.findUnique({ where: { id: input.productId } })
    if (!product || product.status !== "ACTIVE") {
      notFound(res, "Product not found")
      return
    }

    let variant: Variant | null = null
    if (input.variantId) {
      variant = await prisma.variant.findUnique({ where: { id: input.variantId } })
      if (!variant || variant.productId !== product.id) {
        notFound(res, "Variant not found")
        return
      }
    }

    let customBuild: CustomBuild | null = null
    if (input.customBuildId) {
      customBuild = await prisma.customBuild.findUnique({ where: { id: input.customBuildId } })
      if (!customBuild) {
        notFound(res, "Custom build not found")
        return
      }
      if (customBuild.userId && customBuild.userId !== userId) {
        res
          .status(403)
          .json(ApiErrorSchema.parse({ error: { message: "This build belongs to another account", code: "FORBIDDEN" } }))
        return
      }
    }

    const cart = await findOrCreateCart(userId)

    // Dedup rule: a new line matching an existing line's
    // productId/variantId/customBuildId key increments that line's quantity
    // instead of creating a duplicate row. This mirrors the client's own
    // "sameLine" dedup rule and the exact line-identity key documented for
    // `POST /api/cart/merge` in shared/src/cart.ts - using a different rule
    // here would make merge and manual add-twice behave inconsistently.
    const existing = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: input.productId,
        variantId: input.variantId ?? null,
        customBuildId: input.customBuildId ?? null,
      },
    })

    if (existing) {
      const quantity = existing.quantity + input.quantity
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity, lineTotal: existing.unitPrice * quantity },
      })
    } else {
      const unitPrice = computeUnitPrice(product, variant, customBuild)
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id,
          customBuildId: customBuild?.id,
          quantity: input.quantity,
          unitPrice,
          lineTotal: unitPrice * input.quantity,
        },
      })
    }

    const snapshot = await getCartSnapshot(userId)
    res.status(200).json(CartResponseSchema.parse({ cart: snapshot }))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/cart/items/:id - quantity-only, see UpdateCartItemInputSchema's
// doc comment for why this doesn't refresh unitPrice.
cartRouter.patch<{ id: string }>("/api/cart/items/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const input = UpdateCartItemInputSchema.parse(req.body)
    const userId = req.user!.id

    const cart = await findOrCreateCart(userId)
    // Scoped by cartId, not just id - this is the ownership check. An id
    // that exists but belongs to another user's cart falls through to the
    // same 404 as an id that doesn't exist at all (never 403, so existence
    // isn't leaked). `dropReservation` included so the group-buy-lock check
    // below can see it without a second query.
    const item = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id },
      include: { dropReservation: true },
    })
    if (!item) {
      notFound(res, "Cart item not found")
      return
    }

    // A drop-reservation-backed line's quantity is whatever was actually
    // reserved (DropReservation.quantity) - the normal stepper has zero
    // stock check and never touches that row, so letting it bump
    // CartItem.quantity here would desync the two and let this cart claim
    // more units than are genuinely held. Remove-and-re-reserve is the only
    // supported way to change quantity on these lines (see
    // CartErrorCodeSchema's DROP_LINE_QUANTITY_LOCKED doc comment).
    if (item.dropReservation) {
      res.status(409).json(
        ApiErrorSchema.parse({
          error: {
            message: "Group-buy reservations can't change quantity here. Remove and re-reserve at the quantity you want.",
            code: "DROP_LINE_QUANTITY_LOCKED",
          },
        }),
      )
      return
    }

    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: input.quantity, lineTotal: item.unitPrice * input.quantity },
    })

    const snapshot = await getCartSnapshot(userId)
    res.status(200).json(CartResponseSchema.parse({ cart: snapshot }))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/cart/items/:id
//
// A cart line created by POST /api/drops/:slug/reserve has a linked
// DropReservation (DropReservation.cartItemId, @unique - see
// schema.prisma's doc comment on that model). Deleting the CartItem alone
// nulls that FK (onDelete: SetNull) but leaves the reservation row ACTIVE -
// which keeps counting against the drop's availableStock for the full
// remaining 10-minute window even though the user removed it from their
// cart. Must release it in the same request, not rely on a future reserve
// attempt's opportunistic-expiry sweep (that only fires on expiresAt, not
// on an early manual removal).
cartRouter.delete<{ id: string }>("/api/cart/items/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const cart = await findOrCreateCart(userId)
    const item = await prisma.cartItem.findFirst({ where: { id, cartId: cart.id } })
    if (!item) {
      notFound(res, "Cart item not found")
      return
    }

    await prisma.$transaction(async (tx) => {
      // ORDER MATTERS: release the reservation BEFORE deleting the CartItem.
      // `DropReservation.cartItem` is `onDelete: SetNull` - deleting the
      // CartItem first would null `cartItemId` at the DB level immediately,
      // and this `updateMany`'s `where: { cartItemId: item.id }` would then
      // match zero rows, silently failing to release anything.
      //
      // Not every CartItem has a linked reservation (normal shop/
      // configurator lines never do) - `updateMany` (not `update`) so a
      // no-match is a silent no-op, not a thrown "record not found".
      await tx.dropReservation.updateMany({
        where: { cartItemId: item.id, status: "ACTIVE" },
        data: { status: "RELEASED" },
      })
      await tx.cartItem.delete({ where: { id: item.id } })
    })

    const snapshot = await getCartSnapshot(userId)
    res.status(200).json(CartResponseSchema.parse({ cart: snapshot }))
  } catch (err) {
    next(err)
  }
})

// POST /api/cart/merge - full algorithm documented above
// `MergeCartInputSchema` in shared/src/cart.ts; this is that logic.
// Deliberately sequential (not Promise.all) - guest carts are small, and
// writes against the same cart row shouldn't interleave.
cartRouter.post("/api/cart/merge", requireAuth, async (req, res, next) => {
  try {
    const input = MergeCartInputSchema.parse(req.body)
    const userId = req.user!.id
    const cart = await findOrCreateCart(userId)

    for (const guestLine of input.items) {
      const existing = await prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: guestLine.productId,
          variantId: guestLine.variantId ?? null,
          customBuildId: guestLine.customBuildId ?? null,
        },
      })

      if (existing) {
        const quantity = existing.quantity + guestLine.quantity
        await prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity, lineTotal: existing.unitPrice * quantity },
        })
        continue
      }

      // Re-resolve live price/name server-side - never trust the guest
      // payload's unitPrice/name (could be stale or forged localStorage).
      const product = await prisma.product.findUnique({ where: { id: guestLine.productId } })
      if (!product || product.status !== "ACTIVE") {
        logger.warn("cart_merge_skipped_line", { reason: "product_unresolvable", productId: guestLine.productId })
        continue
      }

      let variant: Variant | null = null
      if (guestLine.variantId) {
        variant = await prisma.variant.findUnique({ where: { id: guestLine.variantId } })
        if (!variant || variant.productId !== product.id) {
          logger.warn("cart_merge_skipped_line", { reason: "variant_unresolvable", variantId: guestLine.variantId })
          continue
        }
      }

      let customBuild: CustomBuild | null = null
      if (guestLine.customBuildId) {
        customBuild = await prisma.customBuild.findUnique({ where: { id: guestLine.customBuildId } })
        if (!customBuild || (customBuild.userId && customBuild.userId !== userId)) {
          logger.warn("cart_merge_skipped_line", { reason: "custom_build_unresolvable", customBuildId: guestLine.customBuildId })
          continue
        }
      }

      const unitPrice = computeUnitPrice(product, variant, customBuild)
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id,
          customBuildId: customBuild?.id,
          quantity: guestLine.quantity,
          unitPrice,
          lineTotal: unitPrice * guestLine.quantity,
        },
      })
    }

    const snapshot = await getCartSnapshot(userId)
    res.status(200).json(CartResponseSchema.parse({ cart: snapshot }))
  } catch (err) {
    next(err)
  }
})
