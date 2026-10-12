import { z } from "zod"
import { CentsSchema, CurrencySchema, IdSchema, IsoDateTimeSchema } from "./common"

/**
 * Order status timeline: Placed → Building → Shipped → Delivered.
 *
 * CASING MISMATCH, INTENTIONAL: `schema.prisma`'s `OrderStatus` enum is
 * UPPERCASE (`PLACED`/`BUILDING`/`SHIPPED`/`DELIVERED`) - standard Prisma
 * enum convention - but this wire schema is Title-Case, matching the
 * product spec's prose exactly. Do NOT "fix" either side to match the
 * other; both are intentional (DB enum convention vs. spec-literal wire
 * value). Whoever builds the order routes (webhook handler, GET
 * /api/orders, GET /api/orders/:id) MUST write a small mapping function -
 * same pattern as `toAuthUser()` in server/src/routes/auth.ts, which lives
 * in the route file, not here, per this project's convention that
 * Prisma-row → wire-shape mappers are server-local, not shared - e.g.:
 *   const STATUS_MAP = { PLACED: "Placed", BUILDING: "Building", SHIPPED: "Shipped", DELIVERED: "Delivered" } as const
 * Skipping this mapper is not a silent bug: `OrderSchema.parse()`/
 * `OrderSummarySchema.parse()` will THROW on a raw uppercase Prisma value
 * (not in this enum) - a loud, compile-adjacent failure mode by design.
 * Confirm this with a passing route test, not just a `tsc` pass, since
 * Prisma's enum type and this string union are structurally unrelated to
 * TypeScript (both are just `string` at the type level until `.parse()`
 * runs).
 */
export const OrderStatusSchema = z.enum(["Placed", "Building", "Shipped", "Delivered"])
export type OrderStatus = z.infer<typeof OrderStatusSchema>

export const OrderItemSchema = z.object({
  id: IdSchema,
  orderId: IdSchema,
  productId: IdSchema,
  /** Snapshot ref - exactly one set, same XOR convention as CartItem. */
  variantId: IdSchema.optional(),
  customBuildId: IdSchema.optional(),
  /** Snapshotted product/build name at time of order - survives later catalog edits. */
  name: z.string().min(1),
  unitPrice: CentsSchema,
  quantity: z.number().int().min(1),
  lineTotal: CentsSchema,
})
export type OrderItem = z.infer<typeof OrderItemSchema>

export const OrderSchema = z.object({
  id: IdSchema,
  /** Nullable - guest checkout is allowed. */
  userId: IdSchema.nullable(),
  orderNumber: z.string().min(1),
  status: OrderStatusSchema,
  subtotal: CentsSchema,
  tax: CentsSchema,
  shipping: CentsSchema,
  total: CentsSchema,
  currency: CurrencySchema,
  shippingAddressId: IdSchema.nullable(),
  billingAddressId: IdSchema.nullable(),
  placedAt: IsoDateTimeSchema,
  /** Stripe TEST MODE payment intent id only - see demo banner. */
  stripePaymentIntentId: z.string().nullable(),
  items: z.array(OrderItemSchema).default([]),
})
export type Order = z.infer<typeof OrderSchema>

/**
 * `GET /api/orders` list-row shape - lighter than `OrderSchema` (no `items`
 * array, no address ids) since the order-history page only needs enough to
 * render a row + a link into `GET /api/orders/:id` for full detail.
 * `itemCount` is a count of `OrderItem` rows (COUNT, not SUM of quantities -
 * "3 items" reads as 3 distinct lines, matching how the cart page already
 * counts distinct lines vs. `selectCartCount`'s quantity-sum convention;
 * don't conflate the two counting rules across pages).
 */
export const OrderSummarySchema = z.object({
  id: IdSchema,
  orderNumber: z.string().min(1),
  status: OrderStatusSchema,
  total: CentsSchema,
  currency: CurrencySchema,
  placedAt: IsoDateTimeSchema,
  itemCount: z.number().int().min(0),
})
export type OrderSummary = z.infer<typeof OrderSummarySchema>
