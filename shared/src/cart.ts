import { z } from "zod"
import { CentsSchema, CurrencySchema, IdSchema, IsoDateTimeSchema } from "./common"

/**
 * `variantId` / `customBuildId` are never BOTH set - a cart line can't be a
 * stock variant and a custom build at once. BOTH UNSET is valid: it's a
 * direct line against a zero-variant product (4 of the 23 seeded products -
 * KIT/ACCESSORY items with no SKU variants - reference the base product via
 * `productId` alone, per `product.ts`'s `inStock` derivation rule). A strict
 * XOR (exactly one required) would reject those zero-variant products, which
 * legitimately have neither field set.
 *
 * This schema CANNOT verify that a both-unset line actually points at a
 * zero-variant product - that's a DB fact this module has no access to. The
 * application layer (the cart route/service, not this schema) owns that
 * check: before trusting a both-unset line, confirm the referenced
 * `productId` really has zero variants, or a client could forge a
 * both-unset line against a product that DOES have variants to dodge
 * variant-specific pricing/stock.
 */
function refineNotBothVariantAndBuild(
  data: { variantId?: string; customBuildId?: string },
  ctx: z.RefinementCtx,
) {
  const hasVariant = data.variantId !== undefined
  const hasBuild = data.customBuildId !== undefined
  if (hasVariant && hasBuild) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "variantId and customBuildId cannot both be set (both unset is valid, for a direct no-variant product line)",
      path: ["variantId"],
    })
  }
}

/** Rendered on `/cart` - mirrors the client's `CartItemSnapshot` type exactly. */
export const CartItemSnapshotSchema = z
  .object({
    id: IdSchema,
    productId: IdSchema,
    variantId: IdSchema.optional(),
    customBuildId: IdSchema.optional(),
    name: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPrice: CentsSchema,
    lineTotal: CentsSchema,
    /**
     * Present only when this line is backed by an active group-buy
     * `DropReservation` (see `DropReservation.cartItemId`'s doc comment in
     * schema.prisma). Lets the cart UI render a real hold countdown/label
     * instead of looking like a normal line, and gates the quantity stepper
     * client-side to match the server's `DROP_LINE_QUANTITY_LOCKED`
     * rejection on `PATCH /api/cart/items/:id`.
     */
    dropReservation: z
      .object({
        expiresAt: IsoDateTimeSchema,
        dropSlug: z.string(),
      })
      .optional(),
  })
  .superRefine(refineNotBothVariantAndBuild)
export type CartItemSnapshot = z.infer<typeof CartItemSnapshotSchema>

/** Mirrors the client's `CartSnapshot` type exactly. */
export const CartSnapshotSchema = z.object({
  id: IdSchema,
  currency: CurrencySchema,
  items: z.array(CartItemSnapshotSchema),
  subtotal: CentsSchema,
  /**
   * Server-baseline timestamp, stamped fresh on every cart response - same
   * clock-skew-correction role as `DropStateResponseSchema.serverNow`.
   * `useCountdown` (client/src/features/drops/countdown.ts) requires this as
   * its baseline, never the client's local `Date.now()`, so a held
   * reservation's countdown on `/cart` stays correct even with a skewed
   * system clock.
   */
  serverNow: IsoDateTimeSchema,
})
export type CartSnapshot = z.infer<typeof CartSnapshotSchema>

/** Full DB-shape `CartItem` row - snapshot fields + ownership/timestamps. */
export const CartItemSchema = z
  .object({
    id: IdSchema,
    cartId: IdSchema,
    productId: IdSchema,
    variantId: IdSchema.optional(),
    customBuildId: IdSchema.optional(),
    quantity: z.number().int().min(1),
    /** Cents, snapshotted at add-time - do not re-read live price into an existing line. */
    unitPrice: CentsSchema,
    lineTotal: CentsSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine(refineNotBothVariantAndBuild)
export type CartItem = z.infer<typeof CartItemSchema>

export const CartSchema = z.object({
  id: IdSchema,
  /** Nullable - guest cart keyed by `sessionId` instead. */
  userId: IdSchema.nullable(),
  sessionId: z.string().nullable(),
  currency: CurrencySchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type Cart = z.infer<typeof CartSchema>

/**
 * Cart-page estimate - FICTIONAL, DEMO-ONLY numbers, picked for this
 * portfolio project. This is NOT the real checkout pricing engine: the
 * server recalculates every price at checkout and never trusts this
 * estimate. Keep these three constants as the single source of truth - the
 * free-shipping progress bar must read `freeShippingRemaining` from
 * `calculateCartTotals`, not hardcode the threshold separately.
 */
export const FREE_SHIPPING_THRESHOLD_CENTS = 15000 // $150.00
export const FLAT_SHIPPING_CENTS = 800 // $8.00
export const TAX_RATE = 0.0725 // 7.25%, flat - no per-state/jurisdiction logic in this demo

export interface CartTotals {
  /** Sum of every line's `lineTotal` (snapshotted unit price × quantity). Cents. */
  subtotal: number
  /** 0 if the cart is empty or `subtotal >= FREE_SHIPPING_THRESHOLD_CENTS`, else `FLAT_SHIPPING_CENTS`. Cents. */
  estimatedShipping: number
  /** `round(subtotal * TAX_RATE)`. Cents. Flat demo rate, not a real tax engine. */
  estimatedTax: number
  /** `max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotal)` - drives the progress bar. Cents. */
  freeShippingRemaining: number
}

/**
 * Pure function, all cents in/out - no I/O, no rounding to dollars anywhere
 * in between. Safe to call identically on client (optimistic cart-page
 * estimate) and server (if it ever needs to double-check the client's
 * displayed estimate); still NOT the checkout-authoritative total.
 */
export function calculateCartTotals(items: CartItemSnapshot[]): CartTotals {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0)

  const estimatedShipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS

  const estimatedTax = Math.round(subtotal * TAX_RATE)

  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotal)

  return { subtotal, estimatedShipping, estimatedTax, freeShippingRemaining }
}

// ---------------------------------------------------------------------------
// Cart-sync route contract (DB-backed cart for logged-in users). All 4
// routes below require a session (requireAuth) and return the SAME envelope
// shape (`CartResponseSchema` in api.ts, `{ cart: CartSnapshot }`) - one
// consistent shape means the client refetches nothing extra after any
// mutation. Full route list + method/path/status table lives in
// shared/README.md and the index comment in api.ts; this file only owns the
// request-body shapes, matching the existing convention
// (RegisterInputSchema/LoginInputSchema live in user.ts next to
// AuthUserSchema, not in api.ts).
// ---------------------------------------------------------------------------

/**
 * `POST /api/cart/items` body. Deliberately does NOT accept `unitPrice` or
 * `name` from the client - the server never trusts a client-supplied price,
 * and that applies to every cart WRITE, not just checkout. The route
 * handler looks up the live Product (and Variant/CustomBuild if one of those
 * ids is set) server-side and snapshots ITS price/name onto the new
 * `CartItem` row. Same variantId/customBuildId "both set is invalid, both
 * unset is a valid zero-variant line" rule as `CartItemSnapshotSchema`.
 *
 * Also validate server-side (not expressible in this schema, a DB-fact
 * check, same caveat as `refineNotBothVariantAndBuild`'s doc comment):
 * - `productId` must resolve to an ACTIVE product.
 * - If `variantId` is set, it must belong to `productId`.
 * - If `customBuildId` is set, its `CustomBuild.userId` must be either null
 *   (an unclaimed guest build) or equal to the requesting user's id - 403
 *   FORBIDDEN otherwise (don't let user A add user B's saved build to a cart).
 */
export const AddCartItemInputSchema = z
  .object({
    productId: IdSchema,
    variantId: IdSchema.optional(),
    customBuildId: IdSchema.optional(),
    quantity: z.number().int().min(1),
  })
  .superRefine(refineNotBothVariantAndBuild)
export type AddCartItemInput = z.infer<typeof AddCartItemInputSchema>

/**
 * `PATCH /api/cart/items/:id` body. Quantity-only - does NOT re-fetch/refresh
 * `unitPrice` from the live catalog on every bump (deliberate scope cut: the
 * cart page's own display can go briefly stale if an admin changes a price
 * between add-time and checkout, but `POST /api/checkout/session` always
 * re-verifies live price as the final backstop before charging - see
 * CheckoutSessionResponseSchema's doc comment in api.ts - so there is no
 * price-integrity gap at the moment that actually matters). To force a price
 * refresh, remove and re-add the line instead.
 */
export const UpdateCartItemInputSchema = z.object({
  quantity: z.number().int().min(1),
})
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInputSchema>

/**
 * `POST /api/cart/merge` body - the guest Zustand store's current `items`
 * (see client/src/features/cart/store.ts), sent once right after a
 * successful login/register/Google-OAuth-callback lands. Call this from the
 * auth success path, then clear the guest localStorage store on a
 * successful response.
 *
 * MERGE RULE:
 *
 * For each guest line G in `items`:
 *   1. Compute a line-identity key: `${G.productId}:${G.variantId ?? ""}:${G.customBuildId ?? ""}`.
 *      (Mirrors the client store's own `sameLine` dedup rule, extended to
 *      also key on `customBuildId` - the guest store doesn't carry custom
 *      builds yet, but the DB cart and this schema both support them.)
 *   2. If an existing DB CartItem has the same key: `quantity += G.quantity`,
 *      recompute `lineTotal = unitPrice * quantity` - do NOT overwrite the
 *      DB row's `unitPrice`, it's already the authoritative snapshot from
 *      when that line was first added server-side.
 *   3. If no existing line matches: look up the LIVE price/name server-side
 *      for `G.productId`/`G.variantId`/`G.customBuildId` - never trust
 *      `G.unitPrice`/`G.name` from the guest payload, it could be stale
 *      (price changed since the guest added it) or forged (nothing stopped
 *      a client from hand-editing localStorage) - and insert a new CartItem
 *      with that authoritative price and `G.quantity`.
 *   4. If a guest line's `productId`/`variantId`/`customBuildId` no longer
 *      resolves (deleted/archived since the guest added it): SKIP that line
 *      silently (structured-log a warning, don't throw) - one stale guest
 *      line must not fail the merge for the user's other, valid lines.
 *
 * Returns the full refreshed `CartSnapshot` (same envelope as every other
 * cart route).
 */
export const MergeCartInputSchema = z.object({
  items: z.array(CartItemSnapshotSchema),
})
export type MergeCartInput = z.infer<typeof MergeCartInputSchema>

/**
 * Domain-specific error codes for cart/checkout routes - same pattern as
 * `AuthErrorCodeSchema` in user.ts (an enum living next to the domain it
 * describes, not centralized in api.ts). Routes also use the existing
 * generic codes (`NOT_FOUND`, `FORBIDDEN`, `VALIDATION_ERROR`,
 * `UNAUTHORIZED`) already established by products.ts/auth.ts - those are
 * NOT re-declared here, this enum only covers the genuinely new ones:
 *
 * - `EMPTY_CART` - `POST /api/checkout/session` with zero cart items. 400.
 * - `OUT_OF_STOCK` - `POST /api/checkout/session` found at least one line
 *   whose variant no longer has enough stock to cover the line's quantity.
 *   409. The error message should name the affected line(s) in plain text
 *   (`ApiErrorSchema.error.message`) since the shared error envelope has no
 *   structured-details field - don't add one just for this; keep the error
 *   shape uniform across the whole API.
 * - `DROP_LINE_QUANTITY_LOCKED` - `PATCH /api/cart/items/:id` targeted a
 *   line backed by an active `DropReservation` (group-buy hold). That line's
 *   quantity is locked to whatever was actually reserved - bumping it via
 *   the normal stepper would silently desync `CartItem.quantity` from
 *   `DropReservation.quantity` with zero stock check, letting the cart claim
 *   more units than are genuinely held. 409. Remove and re-reserve at the
 *   desired quantity instead.
 */
export const CartErrorCodeSchema = z.enum(["EMPTY_CART", "OUT_OF_STOCK", "DROP_LINE_QUANTITY_LOCKED"])
export type CartErrorCode = z.infer<typeof CartErrorCodeSchema>
