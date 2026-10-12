import {
  ApiErrorSchema,
  AdminDropResponseSchema,
  AdminUpdateDropInputSchema,
  DropStateResponseSchema,
  ReserveDropInputSchema,
  ReserveDropResponseSchema,
  type DropStateResponse,
} from "@shared"
import type { DropReservation as PrismaDropReservation } from "@prisma/client"
import { Router } from "express"
import { prisma } from "../db/prisma"
import { computeAvailableStock, computeDropStatus, asStringRecord, RESERVATION_TTL_MS } from "../lib/drops"
import { computeUnitPrice } from "../lib/pricing"
import { requireAdmin } from "../middleware/requireAdmin"
import { requireAuth } from "../middleware/requireAuth"
import { findOrCreateCart, getCartSnapshot } from "./cart"

export const dropsRouter = Router()

function notFoundDrop(slug: string | undefined): { message: string; code: "NOT_FOUND" } {
  return { message: `Drop "${slug ?? ""}" not found`, code: "NOT_FOUND" }
}

// GET /api/drops/:slug - PUBLIC, no auth. See shared/src/groupBuyDrop.ts's
// DropStateResponseSchema doc comment for the full "why" on every field
// below (`inStock`/`variant.stock` omission, `serverNow` for clock-skew
// correction).
dropsRouter.get("/api/drops/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }

    const drop = await prisma.groupBuyDrop.findUnique({
      where: { slug },
      include: { product: true, variant: true },
    })
    if (!drop) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundDrop(slug) }))
      return
    }

    const now = new Date()
    const availableStock = Math.max(0, await computeAvailableStock(prisma, drop))
    const dropStatus = computeDropStatus(drop, availableStock, now)

    const product: DropStateResponse["product"] = {
      id: drop.product.id,
      slug: drop.product.slug,
      name: drop.product.name,
      tagline: drop.product.tagline,
      category: drop.product.category,
      basePrice: drop.product.basePrice,
      currency: drop.product.currency,
      specs: asStringRecord(drop.product.specs),
      isConfigurable: drop.product.isConfigurable,
    }

    const variant: DropStateResponse["variant"] = {
      id: drop.variant.id,
      productId: drop.variant.productId,
      name: drop.variant.name,
      sku: drop.variant.sku,
      priceDelta: drop.variant.priceDelta,
      attributes: asStringRecord(drop.variant.attributes),
      stock: drop.variant.stock,
      image: drop.variant.image,
      createdAt: drop.variant.createdAt.toISOString(),
      updatedAt: drop.variant.updatedAt.toISOString(),
    }

    res.status(200).json(
      DropStateResponseSchema.parse({
        slug: drop.slug,
        title: drop.title,
        description: drop.description,
        status: dropStatus,
        availableStock,
        totalStock: drop.totalStock,
        openAt: drop.openAt.toISOString(),
        closeAt: drop.closeAt.toISOString(),
        serverNow: now.toISOString(),
        product,
        variant,
      } satisfies DropStateResponse),
    )
  } catch (err) {
    next(err)
  }
})

type ReserveOutcome =
  | { kind: "ok"; reservation: PrismaDropReservation }
  | { kind: "error"; status: 409; code: "DROP_NOT_LIVE" | "SOLD_OUT"; message: string }

// POST /api/drops/:slug/reserve - auth required. The critical route: one
// `prisma.$transaction` takes a real row lock, opportunistically expires
// stale ACTIVE reservations, recomputes availableStock INSIDE the lock, then
// either rejects (409) or creates/merges a reservation + its linked CartItem
// atomically. See lib/drops.ts's doc comments for the lock/formula details.
// Explicit generic (matches builds.ts's established workaround): mixing
// `requireAuth` (a plain untyped `RequestHandler`) into the handler array
// makes Express's route-param-from-path-literal inference fall back to
// `ParamsDictionary` (`string | string[]`) instead of `{ slug: string }` -
// pin it explicitly so `req.params.slug` stays a plain `string | undefined`.
dropsRouter.post<{ slug: string }>("/api/drops/:slug/reserve", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }
    const input = ReserveDropInputSchema.parse(req.body)
    const userId = req.user!.id

    const dropRef = await prisma.groupBuyDrop.findUnique({ where: { slug }, select: { id: true } })
    if (!dropRef) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundDrop(slug) }))
      return
    }
    const dropId = dropRef.id

    const outcome: ReserveOutcome = await prisma.$transaction(async (tx): Promise<ReserveOutcome> => {
      // (a) Row lock - MUST be tx.$queryRaw, not the top-level
      // prisma.$queryRaw, or the lock never joins this transaction and does
      // nothing to block a concurrent reserve attempt on the same drop.
      await tx.$queryRaw`SELECT 1 FROM "GroupBuyDrop" WHERE id = ${dropId} FOR UPDATE`

      const now = new Date()

      // (b) Opportunistic expiry - no cron in this codebase (schema.prisma's
      // GroupBuyDrop doc comment), this transaction is where stale ACTIVE
      // rows past their expiresAt get flipped.
      await tx.dropReservation.updateMany({
        where: { dropId, status: "ACTIVE", expiresAt: { lt: now } },
        data: { status: "EXPIRED" },
      })

      const drop = await tx.groupBuyDrop.findUniqueOrThrow({
        where: { id: dropId },
        include: { product: true, variant: true },
      })

      // (c) Recompute INSIDE the lock, post-expiry-sweep.
      const availableStock = Math.max(0, await computeAvailableStock(tx, drop))
      const dropStatus = computeDropStatus(drop, availableStock, now)

      // (d) Business-rule gates.
      //
      // A naive `if (dropStatus !== "live") -> DROP_NOT_LIVE` here is wrong
      // for the "sold_out" status specifically - DROP_NOT_LIVE is reserved
      // for "upcoming"/"closed" only; a live-but-exhausted drop must report
      // SOLD_OUT instead, so the client can render "sold out" vs. "not open
      // yet" as distinct messages. Gate on the two non-live-non-sold-out
      // statuses explicitly, then fall through to the
      // quantity-vs-availableStock check below - which also correctly
      // catches the "sold_out" status case for free, since
      // `availableStock <= 0` there and every request quantity is >= 1.
      if (dropStatus === "upcoming" || dropStatus === "closed") {
        return { kind: "error", status: 409, code: "DROP_NOT_LIVE", message: "This drop isn't live right now." }
      }
      if (input.quantity > availableStock) {
        return { kind: "error", status: 409, code: "SOLD_OUT", message: "Not enough units left for that quantity." }
      }

      // (e) Merge into an existing ACTIVE reservation for this user, or
      // create a new reservation + linked CartItem. `findOrCreateCart` is
      // routes/cart.ts's own helper, exported + parameterized specifically
      // for this reuse (see that file's doc comment) - not reimplemented.
      const cart = await findOrCreateCart(userId, tx)
      const unitPrice = computeUnitPrice(drop.product, drop.variant, null)
      const existingReservation = await tx.dropReservation.findFirst({
        where: { dropId, userId, status: "ACTIVE" },
      })

      let reservation: PrismaDropReservation

      if (existingReservation) {
        const mergedQuantity = existingReservation.quantity + input.quantity
        reservation = await tx.dropReservation.update({
          where: { id: existingReservation.id },
          data: { quantity: mergedQuantity, expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS) },
        })

        if (reservation.cartItemId) {
          await tx.cartItem.update({
            where: { id: reservation.cartItemId },
            data: { quantity: mergedQuantity, lineTotal: unitPrice * mergedQuantity },
          })
        } else {
          // Defensive: an ACTIVE reservation should always carry a live
          // cartItemId (the cart.ts DELETE fix releases a reservation the
          // instant its CartItem is removed rather than leaving a dangling
          // ACTIVE row with cartItemId already nulled) - but don't assume
          // that invariant can never be violated. Re-link a fresh CartItem
          // so the merged reservation's stock stays visible in the user's cart.
          const newItem = await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId: drop.productId,
              variantId: drop.variantId,
              quantity: mergedQuantity,
              unitPrice,
              lineTotal: unitPrice * mergedQuantity,
            },
          })
          reservation = await tx.dropReservation.update({
            where: { id: reservation.id },
            data: { cartItemId: newItem.id },
          })
        }
      } else {
        const cartItem = await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: drop.productId,
            variantId: drop.variantId,
            quantity: input.quantity,
            unitPrice,
            lineTotal: unitPrice * input.quantity,
          },
        })
        reservation = await tx.dropReservation.create({
          data: {
            dropId,
            userId,
            cartItemId: cartItem.id,
            quantity: input.quantity,
            status: "ACTIVE",
            expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
          },
        })
      }

      return { kind: "ok", reservation }
    })

    if (outcome.kind === "error") {
      res.status(outcome.status).json(ApiErrorSchema.parse({ error: { message: outcome.message, code: outcome.code } }))
      return
    }

    // Built after the transaction commits, via the top-level `prisma` -
    // same snapshot function cart.ts's own routes use for their response,
    // not reimplemented.
    const cart = await getCartSnapshot(userId)

    res.status(200).json(
      ReserveDropResponseSchema.parse({
        reservation: {
          id: outcome.reservation.id,
          dropId: outcome.reservation.dropId,
          quantity: outcome.reservation.quantity,
          status: "active",
          expiresAt: outcome.reservation.expiresAt.toISOString(),
          createdAt: outcome.reservation.createdAt.toISOString(),
        },
        cart,
      }),
    )
  } catch (err) {
    next(err)
  }
})

// DELETE /api/drops/:slug/reserve - auth required. Cancels the caller's own
// ACTIVE reservation on this drop (if any) and deletes its linked CartItem.
// Idempotent: no ACTIVE reservation found is a silent 204, not a 404 - "make
// sure I don't hold this drop's stock" can't fail just because there was
// nothing to release (same idempotency spirit as POST /api/auth/logout).
dropsRouter.delete<{ slug: string }>("/api/drops/:slug/reserve", requireAuth, async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }
    const userId = req.user!.id

    const dropRef = await prisma.groupBuyDrop.findUnique({ where: { slug }, select: { id: true } })
    if (!dropRef) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundDrop(slug) }))
      return
    }

    await prisma.$transaction(async (tx) => {
      const reservation = await tx.dropReservation.findFirst({
        where: { dropId: dropRef.id, userId, status: "ACTIVE" },
      })
      if (!reservation) return

      await tx.dropReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } })

      if (reservation.cartItemId) {
        const linkedItem = await tx.cartItem.findUnique({ where: { id: reservation.cartItemId } })
        if (linkedItem) await tx.cartItem.delete({ where: { id: linkedItem.id } })
      }
    })

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/** Prisma `GroupBuyDrop` row -> wire `AdminDropResponseSchema.drop`. Extracted so the new GET admin route below and the existing PATCH route's response can't drift apart (same "never duplicate a shape" rule as `toVariant()` in products.ts). */
function toAdminDrop(drop: {
  id: string
  slug: string
  productId: string
  variantId: string
  title: string
  description: string
  openAt: Date
  closeAt: Date
  totalStock: number
  soldCount: number
  isManuallyClosed: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: drop.id,
    slug: drop.slug,
    productId: drop.productId,
    variantId: drop.variantId,
    title: drop.title,
    description: drop.description,
    openAt: drop.openAt.toISOString(),
    closeAt: drop.closeAt.toISOString(),
    totalStock: drop.totalStock,
    soldCount: drop.soldCount,
    isManuallyClosed: drop.isManuallyClosed,
    createdAt: drop.createdAt.toISOString(),
    updatedAt: drop.updatedAt.toISOString(),
  }
}

// GET /api/admin/drops/:slug - requireAuth + requireAdmin. The admin
// detail view behind the Group Buy admin screen - unlike the public
// GET /api/drops/:slug above, this returns the raw row (soldCount,
// isManuallyClosed) rather than the derived public shape, since admin is
// the trust boundary here.
dropsRouter.get<{ slug: string }>("/api/admin/drops/:slug", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }

    const drop = await prisma.groupBuyDrop.findUnique({ where: { slug } })
    if (!drop) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundDrop(slug) }))
      return
    }

    res.status(200).json(AdminDropResponseSchema.parse({ drop: toAdminDrop(drop) }))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/drops/:slug - requireAuth + requireAdmin. See
// AdminUpdateDropInputSchema's doc comment (shared/src/groupBuyDrop.ts) for
// why totalStock is `.positive()` and the
// isManuallyClosed-is-the-real-close-action rationale.
dropsRouter.patch<{ slug: string }>("/api/admin/drops/:slug", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }
    const input = AdminUpdateDropInputSchema.parse(req.body)

    const drop = await prisma.groupBuyDrop.findUnique({ where: { slug } })
    if (!drop) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundDrop(slug) }))
      return
    }

    if (input.totalStock !== undefined) {
      const reservedAgg = await prisma.dropReservation.aggregate({
        where: { dropId: drop.id, status: "ACTIVE" },
        _sum: { quantity: true },
      })
      const reserved = reservedAgg._sum.quantity ?? 0
      const floor = drop.soldCount + reserved
      if (input.totalStock < floor) {
        res.status(400).json(
          ApiErrorSchema.parse({
            error: {
              message: `totalStock can't go below ${floor} (already sold or reserved)`,
              code: "VALIDATION_ERROR",
            },
          }),
        )
        return
      }
    }

    const updated = await prisma.groupBuyDrop.update({
      where: { id: drop.id },
      data: {
        isManuallyClosed: input.isManuallyClosed,
        totalStock: input.totalStock,
        openAt: input.openAt !== undefined ? new Date(input.openAt) : undefined,
        closeAt: input.closeAt !== undefined ? new Date(input.closeAt) : undefined,
      },
    })

    res.status(200).json(AdminDropResponseSchema.parse({ drop: toAdminDrop(updated) }))
  } catch (err) {
    next(err)
  }
})
