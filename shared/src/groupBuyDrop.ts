import { z } from "zod"
import { IdSchema, IsoDateTimeSchema } from "./common"
import { CartSnapshotSchema } from "./cart"
import { ProductSummarySchema, VariantSchema } from "./product"

/**
 * Group Buy / Drop contract.
 *
 * `DropStatus` is COMPUTED, never a DB column (`schema.prisma`'s
 * `GroupBuyDrop` model has no status field at all - see its doc comment).
 * The route handler derives one of these four values at READ time from
 * `openAt`/`closeAt`/`isManuallyClosed`/the live lazy-stock computation:
 *   - "closed"    if `isManuallyClosed` OR `now >= closeAt`
 *   - "upcoming"  else if `now < openAt`
 *   - "sold_out"  else if `availableStock <= 0`
 *   - "live"      otherwise
 * Check order matters (closed beats everything else, sold_out beats live) -
 * a drop that sells its last unit AND passes closeAt in the same window
 * reports "closed", not "sold_out", since closed is terminal.
 *
 * WIRE CASING: lowercase, same convention as `ProductStatusSchema`
 * (`product.ts`) - a direct `.toLowerCase()` of the spec's own prose
 * ("upcoming, live, sold out, closed") with the one two-word value joined
 * `snake_case` (matches the Prisma enum's `SOLD_OUT` value lowercased
 * verbatim, same spirit as `OrderStatus`'s Title-Case-matches-spec-prose
 * rule, just a different casing target). Because this value is computed
 * in-route rather than read off a Prisma column, there is no
 * Prisma-enum-to-wire MAPPER FUNCTION the way `OrderStatus`/`ProductStatus`
 * need one - the handler just returns the lowercase literal it already
 * decided on. The `enum DropStatus` in `schema.prisma` exists purely so the
 * Prisma schema documents the same four states next to the model that
 * drives them; it is not assigned to any column, so don't look for a
 * `dropStatus` field on any Prisma query result.
 */
export const DropStatusSchema = z.enum(["upcoming", "live", "sold_out", "closed"])
export type DropStatus = z.infer<typeof DropStatusSchema>

/**
 * Wire form of `ReservationStatus` - same direct-lowercase-of-Prisma-enum
 * convention as `UserRoleSchema`/`ProductStatusSchema` (unlike `DropStatus`,
 * this one DOES back a real Prisma column, so whoever writes the
 * `DropReservation` row-to-wire mapper needs a small
 * `{ ACTIVE: "active", CONVERTED: "converted", EXPIRED: "expired", RELEASED: "released" }`
 * map - same pattern as `OrderStatus`'s `STATUS_MAP`, just lowercase instead
 * of Title-Case).
 */
export const ReservationStatusSchema = z.enum(["active", "converted", "expired", "released"])
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>

/**
 * Full DB-shape `GroupBuyDrop` row - admin views / internal use. `slug` is
 * the drop's OWN slug (`/drop/:slug` route param), independent of
 * `Product.slug` - they happen to match in the seeded demo row for
 * simplicity, but the schema does not assume they always will (a future
 * drop could reuse an existing catalog product under a different drop
 * slug, e.g. a re-run).
 */
export const GroupBuyDropSchema = z.object({
  id: IdSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase-kebab-case"),
  productId: IdSchema,
  variantId: IdSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  openAt: IsoDateTimeSchema,
  closeAt: IsoDateTimeSchema,
  totalStock: z.number().int().min(0),
  soldCount: z.number().int().min(0),
  isManuallyClosed: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type GroupBuyDrop = z.infer<typeof GroupBuyDropSchema>

/**
 * Full DB-shape `DropReservation` row - internal use. `userId` is
 * deliberately OMITTED from the PUBLIC reservation shape below
 * (`DropReservationPublicSchema`) since the reserving user is always
 * implied by the authenticated session that created it - don't leak it back
 * on the wire.
 */
export const DropReservationSchema = z.object({
  id: IdSchema,
  dropId: IdSchema,
  userId: IdSchema,
  cartItemId: IdSchema.nullable(),
  quantity: z.number().int().min(1),
  status: ReservationStatusSchema,
  expiresAt: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type DropReservation = z.infer<typeof DropReservationSchema>

/** `ReserveDropResponseSchema.reservation` - same row minus `userId`/`cartItemId` (the client doesn't need either; `cartItemId` is an internal linking detail, the cart itself comes back in the same response's `cart` field). */
export const DropReservationPublicSchema = DropReservationSchema.pick({
  id: true,
  dropId: true,
  quantity: true,
  status: true,
  expiresAt: true,
  createdAt: true,
})
export type DropReservationPublic = z.infer<typeof DropReservationPublicSchema>

/**
 * `GET /api/drops/:slug` response - PUBLIC, no auth (same "unauthenticated
 * browsing allowed" convention as `GET /api/products/:slug`; only the
 * reserve action below requires a session).
 *
 * `product` deliberately OMITS `ProductSummarySchema`'s `inStock` field:
 * that field's derivation rule (`Variant.stock > 0` across the product's
 * variants) is MEANINGLESS here - this drop's linked `Variant.stock` is
 * always seeded/left at 0 on purpose (see `schema.prisma`'s doc comment:
 * drop inventory is tracked ENTIRELY by `totalStock`/`soldCount`/
 * reservations, never `Variant.stock`). Including a real `inStock` field
 * here would silently show `false` for a drop that's actually LIVE with
 * stock left, which is exactly the kind of cross-layer inconsistency this
 * schema needs to prevent. Use `availableStock > 0` (already a top-level
 * field on this response) instead, never `product.inStock`.
 *
 * `variant` is the full `VariantSchema` row for transparency (SKU, name,
 * attributes for display) - `variant.stock` on this specific response is
 * NOT meaningful for the same reason as `product.inStock` above; render
 * `availableStock`/`totalStock` for anything stock-related, never
 * `variant.stock`.
 *
 * `serverNow` - ISO timestamp of the server's clock at response time.
 * REQUIRED so the client's countdown timer computes "time until open/close"
 * against the SERVER's clock, not the visitor's (possibly skewed) local
 * clock - a client computing `closeAt - Date.now()` locally could show a
 * materially wrong countdown on a device with bad clock sync. Re-sync the
 * countdown base against a fresh `serverNow` on every poll, not just once
 * on page load.
 */
export const DropStateResponseSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  status: DropStatusSchema,
  availableStock: z.number().int().min(0),
  totalStock: z.number().int().min(0),
  openAt: IsoDateTimeSchema,
  closeAt: IsoDateTimeSchema,
  serverNow: IsoDateTimeSchema,
  product: ProductSummarySchema.omit({ inStock: true }),
  variant: VariantSchema,
})
export type DropStateResponse = z.infer<typeof DropStateResponseSchema>

/**
 * `POST /api/drops/:slug/reserve` request body (auth required - a guest
 * cannot reserve, same "checkout requires auth" precedent as cart/checkout).
 * Quantity cap enforcement (can't reserve more than `availableStock`, or
 * more than some sane per-user max) is a DB-fact/business-rule check the
 * route owns, not expressible here - same documented-gap pattern as every
 * other DB-fact check in this codebase (`cart.ts`'s
 * `refineNotBothVariantAndBuild` doc comment).
 */
export const ReserveDropInputSchema = z.object({
  quantity: z.number().int().min(1),
})
export type ReserveDropInput = z.infer<typeof ReserveDropInputSchema>

/**
 * `POST /api/drops/:slug/reserve` success shape (200). `cart` reuses
 * `CartSnapshotSchema` verbatim (NOT `CartResponseSchema`'s `{ cart }`
 * envelope - that wrapper would double-nest here) - never duplicate a
 * shape: the reserved unit is added to the user's DB cart as a
 * real `CartItem` row in the SAME transaction that creates the
 * `DropReservation` row (`DropReservation.cartItemId` is the FK linking
 * them), so the response can hand back the one, single, already-established
 * cart shape instead of inventing a second "reservation cart line" shape
 * just for drops.
 */
export const ReserveDropResponseSchema = z.object({
  reservation: DropReservationPublicSchema,
  cart: CartSnapshotSchema,
})
export type ReserveDropResponse = z.infer<typeof ReserveDropResponseSchema>

/**
 * `PATCH /api/admin/drops/:slug` request body (admin-only - `requireAdmin`
 * middleware, same role-gate convention as the rest of `/api/admin/*`).
 * Every field optional (a partial patch) - matches this project's
 * established "admin PUT/PATCH reuses the locked schema, `.partial()` over
 * the writable subset" pattern (see `RenameSavedBuildInputSchema`'s sibling
 * routes). `totalStock` is `.positive()` (not `.min(0)`) deliberately - an
 * admin closes a drop via `isManuallyClosed: true`, not by setting
 * `totalStock: 0`; a zero-stock drop that isn't manually closed would read
 * as "sold_out" per the status derivation above, which is a valid state but
 * not what "set stock to 0" as a CLOSE action should mean. If an admin
 * genuinely needs to zero out remaining stock without closing (e.g.
 * correcting an overcount), that's `totalStock: soldCount` sent explicitly,
 * which is still `> 0` whenever `soldCount > 0`; the one edge case this
 * blocks (a never-sold drop administratively zeroed to exactly 0) should go
 * through `isManuallyClosed` instead - document this choice in the admin UI
 * copy, don't silently relax this to `.min(0)` later without re-deciding it
 * on purpose.
 */
export const AdminUpdateDropInputSchema = z.object({
  isManuallyClosed: z.boolean().optional(),
  totalStock: z.number().int().positive().optional(),
  openAt: z.string().datetime().optional(),
  closeAt: z.string().datetime().optional(),
})
export type AdminUpdateDropInput = z.infer<typeof AdminUpdateDropInputSchema>

/**
 * Response shape for both `PATCH /api/admin/drops/:slug` and (for symmetry)
 * any future `GET /api/admin/drops/:slug` admin detail route - the full raw
 * row, since an admin IS the trust boundary that's allowed to see
 * `soldCount`/`isManuallyClosed` directly rather than the derived
 * public `DropStateResponseSchema`.
 */
export const AdminDropResponseSchema = z.object({
  drop: GroupBuyDropSchema,
})
export type AdminDropResponse = z.infer<typeof AdminDropResponseSchema>

/**
 * Domain-specific error codes for `/api/drops/*` routes - same
 * "don't redeclare the generic codes" convention as `CartErrorCodeSchema`
 * (cart.ts): routes also use the existing generic `NOT_FOUND` (unknown
 * slug), `FORBIDDEN` (non-admin hitting `/api/admin/drops/*`),
 * `VALIDATION_ERROR`, and `UNAUTHORIZED` (no session on the reserve route) -
 * those are NOT re-declared here.
 *
 * - `DROP_NOT_LIVE` - `POST /api/drops/:slug/reserve` called while the
 *   drop's computed status is `"upcoming"` or `"closed"`. 409. (Not used for
 *   `"sold_out"` - that has its own code below, so the client can render a
 *   distinct "sold out" vs. "not open yet" message instead of one generic
 *   "not live" string.)
 * - `SOLD_OUT` - `POST /api/drops/:slug/reserve` called with the drop LIVE
 *   but `availableStock < quantity` requested (including the exact
 *   last-unit race condition). 409.
 */
export const DropErrorCodeSchema = z.enum(["DROP_NOT_LIVE", "SOLD_OUT"])
export type DropErrorCode = z.infer<typeof DropErrorCodeSchema>
