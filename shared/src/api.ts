import { z } from "zod"
import { CartSnapshotSchema } from "./cart"
import { IsoDateTimeSchema } from "./common"
import { CustomBuildSchema, SavedBuildSchema, SavedBuildSummarySchema } from "./build"
import { OrderSchema, OrderSummarySchema } from "./order"
import { PriceBreakdownSchema, PriceResultSchema } from "./pricing"
import { ProductSummarySchema, ProductDetailSchema } from "./product"
import { AuthUserSchema } from "./user"

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: IsoDateTimeSchema,
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

/**
 * `products` is one PAGE of the catalog, not the whole thing - see
 * `ProductsQuerySchema` in `product.ts` for the available filters/sort/
 * pagination params. Client code must read `.total` for the real count and
 * re-fetch per page/filter change; the Shop page should drive `page`/filters
 * from URL state rather than fetching once and slicing client-side.
 */
export const ProductsListResponseSchema = z.object({
  products: z.array(ProductSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})
export type ProductsListResponse = z.infer<typeof ProductsListResponseSchema>

export const ProductDetailResponseSchema = z.object({
  product: ProductDetailSchema,
})
export type ProductDetailResponse = z.infer<typeof ProductDetailResponseSchema>

/**
 * Success shape for `POST /api/auth/register`, `POST /api/auth/login`, and
 * `GET /api/auth/me`. Always `AuthUser` (role included, hashedPassword never
 * present) - never the raw DB `User` row. Failure shape on all three is the existing
 * `ApiErrorSchema`, with `error.code` set to one of `AuthErrorCodeSchema`'s
 * values (see user.ts) for the auth-specific failures, or the existing
 * global `VALIDATION_ERROR`/`INTERNAL_ERROR` codes for the generic cases.
 */
export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
})
export type AuthResponse = z.infer<typeof AuthResponseSchema>

/**
 * Success shape for `GET /api/auth/me`. Always 200: `user` is `null` when
 * nobody is signed in, so an anonymous page load does not log a failed
 * request in the browser console.
 */
export const SessionResponseSchema = z.object({
  user: AuthUserSchema.nullable(),
})
export type SessionResponse = z.infer<typeof SessionResponseSchema>

/**
 * Auth route contract - full detail (request/response per route, session
 * requirements, Google OAuth's redirect-not-JSON contract) lives in
 * `shared/README.md`; this comment is the quick-reference index the Express
 * routes are built against:
 *
 *   POST   /api/auth/register        RegisterInputSchema -> 201 AuthResponseSchema | 409 { code: EMAIL_TAKEN }
 *   POST   /api/auth/login           LoginInputSchema    -> 200 AuthResponseSchema | 401 { code: INVALID_CREDENTIALS }
 *   POST   /api/auth/logout          (requires session, idempotent if none) -> 204, no body, destroys session server-side
 *   GET    /api/auth/me              -> 200 SessionResponseSchema (user is null when signed out)
 *   GET    /api/auth/google          Passport OAuth redirect to Google (no JSON body, no session required)
 *   GET    /api/auth/google/callback Passport OAuth callback - NOT JSON, see README redirect contract
 */

/**
 * Single response envelope for all 5 cart-sync routes (`GET /api/cart`,
 * `POST /api/cart/items`, `PATCH /api/cart/items/:id`,
 * `DELETE /api/cart/items/:id`, `POST /api/cart/merge`) - every one returns
 * the FULL refreshed cart, not a partial diff, so the client never needs a
 * second round-trip after a mutation. All 5 routes require a session
 * (`requireAuth`); see `shared/README.md` for the full per-route
 * request-shape/status-code table.
 */
export const CartResponseSchema = z.object({
  cart: CartSnapshotSchema,
  /**
   * Names of lines `GET /api/cart`'s lazy expiry sweep just removed (its
   * linked `DropReservation` naturally expired past `expiresAt` while
   * sitting in the cart - see that route's sweep comment in
   * `server/src/routes/cart.ts`). Only ever populated by `GET /api/cart`
   * itself; every other cart-sync route's response leaves this undefined
   * (nothing for them to sweep). The client fires a "your hold expired"
   * toast per name when this is non-empty.
   */
  expiredLineNames: z.array(z.string()).optional(),
})
export type CartResponse = z.infer<typeof CartResponseSchema>

/**
 * `POST /api/checkout/session` success shape: a Stripe-hosted Checkout
 * redirect URL (test mode). The client's only job on success is
 * `window.location.href = url` - never render a custom payment form against
 * this contract (that's the Payment Element path, not Checkout Session, and
 * this app only builds the latter).
 *
 * This `url` will not resolve to a real Stripe page until the owner supplies
 * real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` values (see
 * `server/.env.example`) - that's an intentional, documented gap, not a
 * contract defect to work around; with the keys unset, the route should
 * fail closed with 500 `INTERNAL_ERROR` ("Stripe is not configured") rather
 * than crash the process or return a bogus url.
 *
 * ---------------------------------------------------------------------
 * STRIPE SDK CONTRACT (not a Zod schema - this is the shape the route must
 * pass to `stripe.checkout.sessions.create(...)`, documented here because
 * it's a real contract between our data model and a third-party SDK, not
 * just an internal detail):
 *
 * Session-level params:
 *   {
 *     mode: "payment",
 *     payment_method_types: ["card"],
 *     line_items: [...],               // see below
 *     success_url: `${CLIENT_ORIGIN}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}`,
 *     cancel_url: `${CLIENT_ORIGIN}/checkout`,
 *     customer_email: user.email,
 *     metadata: { userId: user.id, cartId: cart.id },  // ONLY these two keys needed
 *   }
 *
 * `line_items` - ONE entry per CartItem line, PLUS up to two synthetic
 * lines for shipping/tax (this demo has no Stripe Tax / Shipping Rate
 * objects - the fictional flat rules from `calculateCartTotals` are baked in
 * as plain line items instead):
 *
 *   // real product/build line (one per CartItem):
 *   {
 *     price_data: {
 *       currency: cart.currency,
 *       unit_amount: <freshly-reverified unitPrice, cents>,
 *       product_data: {
 *         name: <CartItem's snapshotted name>,
 *         metadata: { kind: "line", productId, variantId: variantId ?? "", customBuildId: customBuildId ?? "" },
 *       },
 *     },
 *     quantity: <CartItem.quantity>,
 *   }
 *
 *   // synthetic shipping line - ONLY if estimatedShipping > 0:
 *   { price_data: { currency, unit_amount: estimatedShipping, product_data: { name: "Shipping", metadata: { kind: "shipping" } } }, quantity: 1 }
 *
 *   // synthetic tax line - ONLY if estimatedTax > 0:
 *   { price_data: { currency, unit_amount: estimatedTax, product_data: { name: "Estimated tax", metadata: { kind: "tax" } } }, quantity: 1 }
 *
 * Before building `line_items`, the route MUST (in this order):
 *   1. 400 `EMPTY_CART` if the user's cart has zero items.
 *   2. Re-fetch LIVE price for every line from Product/Variant (never trust
 *      a possibly-stale `CartItem.unitPrice` snapshot) and persist the
 *      refreshed `unitPrice`/`lineTotal` back onto each CartItem row - this
 *      IS the server-recalculates-price-at-checkout requirement, applied by
 *      re-deriving from the catalog, not from anything the request body sent
 *      (this route takes NO body - there is nothing to distrust from the
 *      client because nothing price-related is accepted from it at all).
 *   3. 409 `OUT_OF_STOCK` if any variant-backed line's `Variant.stock` is now
 *      less than its `quantity`. Name the offending line(s) in the error
 *      message.
 *   4. Call `calculateCartTotals` (from `./cart.ts`, same function the cart
 *      page already uses) on the refreshed snapshots to get
 *      subtotal/estimatedShipping/estimatedTax for the synthetic lines.
 *
 * ---------------------------------------------------------------------
 * WEBHOOK CONTRACT - `POST /api/webhooks/stripe`, event `checkout.session.completed`:
 *
 * Easy to get wrong and silently break signature verification: this route
 * MUST be mounted with Express's raw body parser
 * (`express.raw({ type: "application/json" })`) BEFORE the app-wide
 * `express.json()` middleware in `server/src/app.ts` - Stripe's
 * `stripe.webhooks.constructEvent(rawBody, signature, secret)` needs the
 * EXACT original byte stream to verify the signature; if `express.json()`
 * runs first, the body is already parsed/re-serialized JSON and signature
 * verification fails on every event, every time, with no obvious error
 * pointing at middleware order. `app.ts` currently mounts `express.json()`
 * globally near the top (line ~61) before any route router - the webhook
 * route needs its own `express.raw(...)` applied to JUST that one path,
 * mounted ahead of the global `express.json()` call, not mixed into the
 * same router as the rest of the API.
 *
 * Processing, in order:
 *   1. Verify signature with `STRIPE_WEBHOOK_SECRET` against the raw body.
 *      Any other event type: 200 no-op (ack and ignore) - this app only
 *      acts on `checkout.session.completed`.
 *   2. IDEMPOTENCY (chosen mechanism: the EXISTING unique constraint on
 *      `Order.stripePaymentIntentId`, no new table/column): look up
 *      `prisma.order.findUnique({ where: { stripePaymentIntentId: session.payment_intent } })`.
 *      If found, this is a Stripe retry of an already-processed event -
 *      respond 200 immediately, do nothing else. This is a check-then-act
 *      with a small race window; close it with a second backstop at step 4
 *      (catch the Prisma P2002 unique-constraint violation on insert and
 *      treat it identically to "already processed," not as a 500).
 *   3. Call `stripe.checkout.sessions.listLineItems(session.id, { expand: ["data.price.product"] })`
 *      to retrieve the line items WITH the `kind`/`productId`/`variantId`/
 *      `customBuildId` metadata set at session-creation time. Build
 *      `OrderItem` rows from every line tagged `kind: "line"` only (skip
 *      the synthetic `"shipping"`/`"tax"` lines - those become the Order's
 *      `shipping`/`tax` columns directly, read from that same line's
 *      amount; 0 if no such line exists). Use `session.amount_total`
 *      (Stripe's own authoritative charged total) for `Order.total` - don't
 *      re-derive total from the reconstructed lines, `amount_total` is what
 *      the card was actually charged. Deliberately does NOT depend on the
 *      local `CartItem` rows still existing at webhook time - Stripe's own
 *      stored line items are the source of truth for order reconstruction,
 *      which also means a user clearing/changing their cart between
 *      session-creation and webhook-delivery can't corrupt the order.
 *   4. In one `prisma.$transaction`: create the `Order` (status `"Placed"`
 *      per `OrderStatusSchema` - remember the casing-mapper flag on that
 *      schema, it applies here too) + its `OrderItem` rows; decrement
 *      `Variant.stock` by `quantity` for every OrderItem that has a
 *      `variantId` (skip for `customBuildId`-only and neither-set lines -
 *      decrementing the individual component variants inside a sold custom
 *      build is explicitly OUT OF SCOPE here - a known gap for a future
 *      inventory-per-configurator-selection pass, not something silently
 *      dropped); delete every `CartItem` row for `metadata.cartId` (clears
 *      the cart, Cart row itself stays - `GET /api/cart` keeps returning the
 *      same cart id, now empty).
 *   5. Respond 200 to Stripe AFTER the transaction commits. Send the
 *      confirmation email (Resend, or the documented console-log fallback
 *      if unconfigured) AFTER acking 200 - don't let a slow email send risk
 *      Stripe's webhook timeout and trigger an unnecessary retry.
 *
 * KNOWN EDGE CASE, documented not solved (acceptable for a portfolio demo,
 * not a high-volume checkout system): if a user opens two checkout sessions
 * against the same cart (e.g. two tabs) and completes both, the first
 * webhook to arrive reconstructs and clears the cart normally; by the time
 * the second arrives it has a DIFFERENT `payment_intent` (so step 2's
 * idempotency check doesn't catch it) but step 3 still works fine since
 * order reconstruction reads Stripe's own line items, not the local cart -
 * so BOTH orders get created correctly, and the user is simply charged
 * twice for the same items (a real double-submission, not a data-integrity
 * bug). Preventing the double-submission itself (e.g. disabling the
 * checkout button after first click, or invalidating a cart's other
 * in-flight sessions) is a UI/wiring concern, not a contracts-schema fix.
 */
export const CheckoutSessionResponseSchema = z.object({
  url: z.string().url(),
})
export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponseSchema>

/**
 * `GET /api/orders` (auth required): newest-first list of the requesting
 * user's own orders, summary shape only (no items array - see
 * `OrderSummarySchema` in order.ts). Empty array (not 404) when the user has
 * no orders yet.
 */
export const OrdersListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
})
export type OrdersListResponse = z.infer<typeof OrdersListResponseSchema>

/**
 * `GET /api/orders/:id` (auth required): full detail incl. `items`. 404
 * `NOT_FOUND` if the order doesn't exist OR belongs to a DIFFERENT user -
 * deliberately the SAME code/status for both cases (same "don't let a 403
 * leak existence" reasoning used for `INVALID_CREDENTIALS` - see user.ts).
 * Never a 403 here.
 */
export const OrderDetailResponseSchema = z.object({
  order: OrderSchema,
})
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>

/**
 * Cart/checkout/orders route contract - quick-reference index (full
 * per-route table incl. request bodies and every error code lives in
 * `shared/README.md`):
 *
 *   GET    /api/cart                 (auth) -> 200 CartResponseSchema (auto-creates an empty cart on first call)
 *   POST   /api/cart/items           (auth) AddCartItemInputSchema       -> 200 CartResponseSchema | 404 NOT_FOUND | 403 FORBIDDEN
 *   PATCH  /api/cart/items/:id       (auth) UpdateCartItemInputSchema    -> 200 CartResponseSchema | 404 NOT_FOUND
 *   DELETE /api/cart/items/:id       (auth) -> 200 CartResponseSchema | 404 NOT_FOUND
 *   POST   /api/cart/merge           (auth) MergeCartInputSchema         -> 200 CartResponseSchema
 *   POST   /api/checkout/session     (auth) (no body)                    -> 200 CheckoutSessionResponseSchema | 400 EMPTY_CART | 409 OUT_OF_STOCK
 *   POST   /api/webhooks/stripe      (no session - Stripe calls this directly) raw body, mounted BEFORE express.json(), see CheckoutSessionResponseSchema's doc comment
 *   GET    /api/orders               (auth) -> 200 OrdersListResponseSchema
 *   GET    /api/orders/:id           (auth) -> 200 OrderDetailResponseSchema | 404 NOT_FOUND
 *
 * All auth-gated routes return 401 with ApiErrorSchema (`code: "UNAUTHORIZED"`)
 * on missing/invalid session, never a silent redirect from the API layer -
 * the client redirects on 401.
 */

/**
 * `POST /api/builds` success shape (201). `build.totalPrice` is always the
 * freshly-`calculatePrice`'d subtotal (same number as `price.subtotal`
 * below) - never a client-supplied value, see
 * `CreateCustomBuildInputSchema`'s doc comment in build.ts. `price` is the
 * success-only breakdown (`PriceBreakdownSchema`, NOT the full
 * `PriceResultSchema` union) because a failed `calculatePrice` call never
 * reaches this response at all - the route 400s before writing anything;
 * see shared/README.md for the exact error-code table. `savedBuild` is
 * `null` iff the request omitted `label` (a mint-without-save call) - never
 * an empty object, so the client can do a plain truthy check.
 */
export const CreateBuildResponseSchema = z.object({
  build: CustomBuildSchema,
  price: PriceBreakdownSchema,
  savedBuild: SavedBuildSchema.nullable(),
})
export type CreateBuildResponse = z.infer<typeof CreateBuildResponseSchema>

/**
 * `GET /api/builds` (auth required) success shape - newest-saved-first
 * (`SavedBuild.createdAt desc`), empty array if the user has saved nothing
 * yet (same "empty array, never 404" convention as
 * `OrdersListResponseSchema`).
 */
export const SavedBuildsListResponseSchema = z.object({
  builds: z.array(SavedBuildSummarySchema),
})
export type SavedBuildsListResponse = z.infer<typeof SavedBuildsListResponseSchema>

/**
 * `GET /api/builds/:id` success shape - PUBLIC, no auth (see
 * shared/README.md for the full public-vs-gated reasoning: an unguessable
 * cuid is the access control here, same spirit as this app's existing
 * 404-not-403 leak-avoidance convention, just applied to "can view" instead
 * of "can mutate"). Serves BOTH the
 * `/build?b=...` URL-codec restore case and the new `/b/:id` share page -
 * same shape either way, the client decides what to do with it.
 *
 * `price` is the FULL discriminated union (`PriceResultSchema`), not the
 * success-only breakdown - this route recomputes `calculatePrice` FRESH on
 * every single read (never serves the stored `CustomBuild.totalPrice` as
 * truth) specifically so a share link never shows stale pricing after a
 * catalog change, and per `pricing.ts`'s "never throws" contract a failed
 * recompute (e.g. an option id the catalog no longer has) must still produce
 * a 200 with a renderable build, not a 500. When `price.ok === false`,
 * `build.totalPrice` falls back to the STORED `CustomBuild.totalPrice` (the
 * last known-good number) - the client should treat that as a definitely-stale
 * estimate and show the `price.error.message` alongside it, not hide the
 * discrepancy.
 *
 * 404 `ApiErrorSchema` (`code: "NOT_FOUND"`) if no `CustomBuild` with this id
 * exists. There is no "exists but not yours" case to hide here (route is
 * public), so this is a plain not-found, not the leak-avoidance pattern.
 */
export const BuildDetailResponseSchema = z.object({
  build: CustomBuildSchema,
  price: PriceResultSchema,
})
export type BuildDetailResponse = z.infer<typeof BuildDetailResponseSchema>

/**
 * `PATCH /api/builds/:id` success shape - rename only, returns the same row
 * shape `GET /api/builds` lists (so the client can patch its in-memory list
 * without a full re-fetch).
 */
export const RenameBuildResponseSchema = z.object({
  build: SavedBuildSummarySchema,
})
export type RenameBuildResponse = z.infer<typeof RenameBuildResponseSchema>

/**
 * Builds route contract - quick-reference index (full per-route table,
 * ownership rules, and the OG-image prose contract live in
 * shared/README.md):
 *
 *   POST   /api/builds             (auth) CreateCustomBuildInputSchema -> 201 CreateBuildResponseSchema | 400 (VALIDATION_ERROR, or a PricingErrorCode - see README)
 *   GET    /api/builds             (auth) -> 200 SavedBuildsListResponseSchema
 *   GET    /api/builds/:id         (PUBLIC - no auth) -> 200 BuildDetailResponseSchema | 404 NOT_FOUND
 *   PATCH  /api/builds/:id         (auth, must own via SavedBuild.userId) RenameSavedBuildInputSchema -> 200 RenameBuildResponseSchema | 404 NOT_FOUND
 *   DELETE /api/builds/:id         (auth, must own via SavedBuild.userId) -> 204, no body | 404 NOT_FOUND
 *   GET    /api/builds/:id/og-image (PUBLIC - no auth) -> 200 image bytes (image/svg+xml recommended, see README) | 404 ApiErrorSchema NOT_FOUND
 *
 * PATCH/DELETE 404-not-403 on a non-owned id, same leak-avoidance convention
 * as orders/cart items (see README for why this one specifically gates on
 * `SavedBuild.userId`, not `CustomBuild.userId`).
 */
