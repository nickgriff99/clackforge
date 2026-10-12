import type { GroupBuyDrop, PrismaClient, Prisma as PrismaNS } from "@prisma/client"
import type { DropStatus } from "@shared"

/** Either the top-level `prisma` client or an in-transaction `tx` - both expose `.dropReservation`. */
export type DropsDb = PrismaClient | PrismaNS.TransactionClient

/** A signed-in user's reservation on a drop holds its stock for 10 minutes. */
export const RESERVATION_TTL_MS = 10 * 60 * 1000

/**
 * Priority order locked by shared/src/groupBuyDrop.ts's `DropStatusSchema`
 * doc comment: closed > upcoming > sold_out > live. Pure function - the
 * caller supplies `availableStock` (already computed from the live
 * reservation SUM) and `now`, so a caller inside the reserve route's
 * transaction can pass the SAME `now` it used for the opportunistic-expiry
 * UPDATE rather than reading the clock twice.
 */
export function computeDropStatus(
  drop: Pick<GroupBuyDrop, "openAt" | "closeAt" | "isManuallyClosed">,
  availableStock: number,
  now: Date,
): DropStatus {
  if (drop.isManuallyClosed || now >= drop.closeAt) return "closed"
  if (now < drop.openAt) return "upcoming"
  if (availableStock <= 0) return "sold_out"
  return "live"
}

/**
 * `availableStock = totalStock - soldCount - SUM(quantity WHERE dropId=? AND
 * status=ACTIVE)` - the lazy-stock formula documented on schema.prisma's
 * `GroupBuyDrop` model. NOT clamped to >= 0 here (callers decide whether to
 * clamp for display vs. use the raw signed value for a stricter check) -
 * see `GET /api/drops/:slug`'s handler for where the clamp happens.
 *
 * LOUD CALLING-CONVENTION NOTE: inside `POST /api/drops/:slug/reserve`'s
 * `prisma.$transaction(async (tx) => ...)`, this MUST be called with `tx`,
 * never the top-level `prisma` - the whole point of the `SELECT ... FOR
 * UPDATE` row lock taken earlier in that transaction is to make this SUM
 * observe a consistent, locked snapshot (post opportunistic-expiry) that no
 * concurrent reserve attempt can race against. Calling it with the
 * unlocked top-level `prisma` here would silently defeat the lock.
 */
export async function computeAvailableStock(
  client: DropsDb,
  drop: Pick<GroupBuyDrop, "id" | "totalStock" | "soldCount">,
): Promise<number> {
  const agg = await client.dropReservation.aggregate({
    where: { dropId: drop.id, status: "ACTIVE" },
    _sum: { quantity: true },
  })
  const reserved = agg._sum.quantity ?? 0
  return drop.totalStock - drop.soldCount - reserved
}

/** `Json` columns (Product.specs / Variant.attributes) are always written as flat string maps - see products.ts's identical private helper. */
export function asStringRecord(value: unknown): Record<string, string> {
  return value as Record<string, string>
}
