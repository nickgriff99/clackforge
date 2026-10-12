import { z } from "zod"
import { CurrencySchema } from "./common"
import { OrderSchema, OrderStatusSchema, OrderSummarySchema, type OrderStatus } from "./order"
import { ProductSchema, ProductsSortSchema, ProductStatusSchema, ProductTypeSchema, VariantSchema } from "./product"

/**
 * Admin product/variant CRUD + orders table.
 *
 * Schemas here use the WIRE-level (Zod) casing that
 * `ProductStatusSchema`/`OrderStatusSchema` already lock elsewhere in this
 * package, not Prisma's uppercase DB-enum literals - see the two doc
 * comments below (soft-delete status value, and the order status transition
 * rule) for exactly what that means in practice.
 */

// --- Products (admin) ---------------------------------------------------

/**
 * `GET /api/admin/products` list-row shape. `variantCount`/`totalStock` are
 * COMPUTED (aggregate over this product's `Variant` rows) - not DB columns,
 * same "the route must do an extra query, this isn't free" flag as
 * `ProductSummarySchema.inStock` in product.ts. `status` is included here
 * (unlike the public `ProductSummarySchema`) because admin list view is the
 * one place a draft/archived product must be visible and distinguishable.
 */
export const AdminProductListItemSchema = ProductSchema.pick({
  id: true,
  slug: true,
  name: true,
  category: true,
  basePrice: true,
  currency: true,
  status: true,
  isConfigurable: true,
  updatedAt: true,
}).extend({
  variantCount: z.number().int().min(0),
  totalStock: z.number().int().min(0),
})
export type AdminProductListItem = z.infer<typeof AdminProductListItemSchema>

/** `GET /api/admin/products/:id` detail shape - full row + its variants, newest-admin-edit-friendly (no `inStock` derivation, admin needs raw `status`/`stock`, not the customer-facing boolean). */
export const AdminProductDetailSchema = ProductSchema.extend({
  variants: z.array(VariantSchema).default([]),
})
export type AdminProductDetail = z.infer<typeof AdminProductDetailSchema>

/**
 * `GET /api/admin/products` query params - same Express `req.query`
 * string-coercion caveats as `ProductsQuerySchema` in product.ts (every
 * field below must survive the wire as a string). `status` is admin-only
 * (the public query has no such filter - draft/archived are invisible
 * there by construction).
 */
export const AdminProductsQuerySchema = z.object({
  type: ProductTypeSchema.optional(),
  status: ProductStatusSchema.optional(),
  search: z.string().optional(),
  sort: ProductsSortSchema.optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
})
export type AdminProductsQuery = z.infer<typeof AdminProductsQuerySchema>

/** `POST /api/admin/products` body. `slug` is required (immutable identity - see `UpdateProductInputSchema` below for why it's omitted on update, not just made optional). */
export const CreateProductInputSchema = ProductSchema.pick({
  slug: true,
  name: true,
  tagline: true,
  description: true,
  category: true,
  basePrice: true,
  isConfigurable: true,
}).extend({
  currency: CurrencySchema.optional().default("usd"),
  images: z.array(z.string().url()).optional().default([]),
  specs: z.record(z.string(), z.string()).optional().default({}),
  status: ProductStatusSchema.optional().default("active"),
})
export type CreateProductInput = z.infer<typeof CreateProductInputSchema>

/**
 * `PATCH /api/admin/products/:id` body. `slug` is omitted (not just
 * `.optional()`'d via `.partial()`) - slug is this product's stable
 * identity (used in the public `/shop/:slug` route, see product.ts), so
 * renaming it here would silently break any outstanding link/bookmark/cart
 * snapshot referencing the old slug. If the brand genuinely needs to rename
 * a slug, that's a deliberate separate admin action, not a side effect of a
 * routine edit - not built here (no route asked for it).
 */
export const UpdateProductInputSchema = CreateProductInputSchema.omit({ slug: true }).partial()
export type UpdateProductInput = z.infer<typeof UpdateProductInputSchema>

/** `POST /api/admin/products/:id/variants` body. */
export const CreateVariantInputSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  /** Cents, added to the product's basePrice. Can be negative (discount SKU) - same convention as `VariantSchema.priceDelta`. */
  priceDelta: z.number().int(),
  attributes: z.record(z.string(), z.string()).default({}),
  stock: z.number().int().min(0).default(0),
  image: z.string().url().nullable().optional(),
})
export type CreateVariantInput = z.infer<typeof CreateVariantInputSchema>

/** `PATCH /api/admin/variants/:id` body. */
export const UpdateVariantInputSchema = CreateVariantInputSchema.partial()
export type UpdateVariantInput = z.infer<typeof UpdateVariantInputSchema>

export const AdminProductsListResponseSchema = z.object({
  products: z.array(AdminProductListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})
export type AdminProductsListResponse = z.infer<typeof AdminProductsListResponseSchema>

export const AdminProductResponseSchema = z.object({ product: AdminProductDetailSchema })
export type AdminProductResponse = z.infer<typeof AdminProductResponseSchema>

export const AdminVariantResponseSchema = z.object({ variant: VariantSchema })
export type AdminVariantResponse = z.infer<typeof AdminVariantResponseSchema>

/**
 * `error.code` values for `POST`/`PATCH` product and variant routes, when
 * the conflicting unique DB column (`Product.slug` / `Variant.sku`) is
 * already taken by a different row. Both are 409s, checked BEFORE insert
 * per this project's existing convention (`EMAIL_TAKEN` in auth.ts) - a
 * clean 409, not a caught Postgres unique-constraint error surfacing as a
 * raw 500.
 */
export const AdminCatalogErrorCodeSchema = z.enum(["SLUG_TAKEN", "SKU_TAKEN"])
export type AdminCatalogErrorCode = z.infer<typeof AdminCatalogErrorCodeSchema>

/**
 * DELETE semantics for both admin catalog routes - NEITHER is a real SQL
 * DELETE, and this is load-bearing, not a style choice:
 *
 * `DELETE /api/admin/products/:id` → soft delete: sets `Product.status` to
 * `"archived"` (the lowercase wire value `ProductStatusSchema` already
 * locks - NOT the uppercase Prisma DB-enum literal `ARCHIVED`; the route's
 * own row-to-wire mapping, same pattern as every other status field in this
 * project, maps `ProductStatus.ARCHIVED` (DB) <-> `"archived"` (wire)).
 * A real DELETE is impossible here without a migration: `schema.prisma`'s
 * `OrderItem.productId` and `CartItem.productId` are both required
 * (non-nullable) FKs into `Product` with NO `onDelete` clause declared,
 * which Prisma/Postgres defaults to `NO ACTION` (== `RESTRICT`) - confirmed
 * directly in schema.prisma (`model OrderItem`/`model CartItem`, `product`
 * relation fields), not assumed. The instant a product has EVER been
 * ordered or sits in any live cart, a real `DELETE FROM "Product"` throws a
 * foreign-key-violation 500. Soft delete sidesteps this entirely and keeps
 * order history / historic cart snapshots intact.
 *
 * `DELETE /api/admin/variants/:id` → same reasoning, same shape: sets
 * `Variant.stock` to `0`, the row is never removed. `CartItem.variantId` /
 * `OrderItem.variantId` are both nullable FKs into `Variant` but still have
 * NO `onDelete` clause (default `NO ACTION`) - a real delete would still
 * 500 the instant any order or cart line ever referenced that variant.
 * Driving `stock` to 0 makes the variant immediately unorderable through
 * every existing stock check (cart add, checkout re-verify, drop lazy-stock
 * math) with zero new code on the read side.
 *
 * Neither route is a true "undo" - re-activating a soft-deleted product/
 * variant is just a normal `PATCH` back to `status: "active"` /
 * `stock: <n>`, using the same update routes above, not a separate restore
 * endpoint.
 */

// --- Orders (admin) ------------------------------------------------------

/**
 * `GET /api/admin/orders` list-row shape. Adds the two fields an admin
 * table needs that the customer-facing `OrderSummarySchema` has no reason
 * to carry (a customer already knows their own identity) - both nullable
 * because `Order.userId` itself is nullable (see order.ts's
 * `OrderStatusSchema` doc comment on the Order model: guest checkout isn't
 * supported, authentication is required to check out, so in practice this
 * will always resolve, but the schema stays honest to the nullable FK
 * rather than asserting non-null and risking a `.parse()` throw on a
 * legacy/edge-case row).
 */
export const AdminOrderSummarySchema = OrderSummarySchema.extend({
  customerEmail: z.string().email().nullable(),
  customerName: z.string().nullable(),
})
export type AdminOrderSummary = z.infer<typeof AdminOrderSummarySchema>

/** `GET /api/admin/orders/:id` detail shape - full `OrderSchema` (incl. `items`) + the same two customer-identity fields as the list row above. */
export const AdminOrderDetailSchema = OrderSchema.extend({
  customerEmail: z.string().email().nullable(),
  customerName: z.string().nullable(),
})
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>

/** `GET /api/admin/orders` query params - same string-wire-coercion caveats as `AdminProductsQuerySchema` above. `search` matches against `orderNumber`/customer email, route's own choice which columns, not locked here. */
export const AdminOrdersQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
})
export type AdminOrdersQuery = z.infer<typeof AdminOrdersQuerySchema>

/**
 * `PATCH /api/admin/orders/:id/status` body. `status` is the WIRE-level
 * Title-Case value (`OrderStatusSchema` = `"Placed"|"Building"|"Shipped"|
 * "Delivered"`, locked in order.ts) - NOT the Prisma DB-enum uppercase
 * literal. The route handler maps wire -> DB enum on write using the same
 * mapper convention order.ts's doc comment already calls for on read
 * (`STATUS_MAP`-style), just run in the other direction.
 */
export const UpdateOrderStatusInputSchema = z.object({ status: OrderStatusSchema })
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusInputSchema>

/**
 * Transition rule for `PATCH /api/admin/orders/:id/status` - linear,
 * forward-only, no skips, no backward moves:
 *
 *   Placed -> Building -> Shipped -> Delivered
 *
 * (wire values, per `OrderStatusSchema`; the equivalent DB-enum values are
 * `PLACED -> BUILDING -> SHIPPED -> DELIVERED`, see schema.prisma's
 * `OrderStatus` enum. This body's `status` field is validated by the
 * wire-level `OrderStatusSchema`, not the DB enum.)
 *
 * `Delivered` is terminal - no further transition is ever valid from it,
 * including a no-op `Delivered -> Delivered`. ANY requested transition that
 * is not the immediate next step in this exact sequence (skip-ahead,
 * backward, same-state, or a transition off of `Delivered`) is a `409`
 * with `error.code: "INVALID_TRANSITION"`, not a 400 - the request body is
 * shape-valid (a real `OrderStatus` value), it's the STATE transition that's
 * rejected, which is what 409 Conflict means.
 */
export const AdminOrderErrorCodeSchema = z.enum(["INVALID_TRANSITION"])
export type AdminOrderErrorCode = z.infer<typeof AdminOrderErrorCodeSchema>

/**
 * Runtime form of the transition rule documented above, so the SERVER route
 * (`PATCH /api/admin/orders/:id/status`) and the CLIENT's "Mark as {next
 * status}" button (`AdminOrders.tsx` - a single fixed-action button per row,
 * not a free-choice select, to remove the possibility of an invalid
 * transition from the UI entirely) both compute "what's the one valid next
 * status" from ONE place instead of two independently-hand-copied sequence
 * arrays silently drifting apart later. Exported here (not re-derived
 * per-call-site) because this is a `shared/` contract file both sides
 * already import from.
 */
export const ORDER_STATUS_TRANSITION_SEQUENCE: readonly OrderStatus[] = ["Placed", "Building", "Shipped", "Delivered"]

/** `undefined` for `Delivered` (terminal) or any value not in the sequence - never throws. */
export function getNextOrderStatus(current: OrderStatus): OrderStatus | undefined {
  const idx = ORDER_STATUS_TRANSITION_SEQUENCE.indexOf(current)
  if (idx === -1 || idx === ORDER_STATUS_TRANSITION_SEQUENCE.length - 1) return undefined
  return ORDER_STATUS_TRANSITION_SEQUENCE[idx + 1]
}

export const AdminOrdersListResponseSchema = z.object({
  orders: z.array(AdminOrderSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
})
export type AdminOrdersListResponse = z.infer<typeof AdminOrdersListResponseSchema>

export const AdminOrderDetailResponseSchema = z.object({ order: AdminOrderDetailSchema })
export type AdminOrderDetailResponse = z.infer<typeof AdminOrderDetailResponseSchema>

/**
 * Admin product/variant/order route contract - quick-reference index (full
 * admin route table, incl. every status code, lives in
 * `shared/README.md`). All routes below require BOTH `requireAuth` AND
 * `requireAdmin` (see `server/src/middleware/requireAdmin.ts`) - compose in
 * that exact order, same as the existing `PATCH /api/admin/drops/:slug`
 * route, so an unauthenticated admin request 401s (not 403s).
 *
 *   GET    /api/admin/products            AdminProductsQuerySchema   -> 200 AdminProductsListResponseSchema
 *   POST   /api/admin/products            CreateProductInputSchema  -> 201 AdminProductResponseSchema | 409 { code: "SLUG_TAKEN" }
 *   GET    /api/admin/products/:id        -> 200 AdminProductResponseSchema | 404 NOT_FOUND
 *   PATCH  /api/admin/products/:id        UpdateProductInputSchema  -> 200 AdminProductResponseSchema | 404 NOT_FOUND
 *   DELETE /api/admin/products/:id        (soft delete, see doc comment above) -> 200 AdminProductResponseSchema | 404 NOT_FOUND
 *   POST   /api/admin/products/:id/variants  CreateVariantInputSchema -> 201 AdminVariantResponseSchema | 404 NOT_FOUND (product) | 409 { code: "SKU_TAKEN" }
 *   PATCH  /api/admin/variants/:id        UpdateVariantInputSchema  -> 200 AdminVariantResponseSchema | 404 NOT_FOUND | 409 { code: "SKU_TAKEN" }
 *   DELETE /api/admin/variants/:id        (soft delete, see doc comment above) -> 200 AdminVariantResponseSchema | 404 NOT_FOUND
 *   GET    /api/admin/orders              AdminOrdersQuerySchema     -> 200 AdminOrdersListResponseSchema
 *   GET    /api/admin/orders/:id          -> 200 AdminOrderDetailResponseSchema | 404 NOT_FOUND
 *   PATCH  /api/admin/orders/:id/status   UpdateOrderStatusInputSchema -> 200 AdminOrderDetailResponseSchema | 404 NOT_FOUND | 409 { code: "INVALID_TRANSITION" }
 *
 * 404s on all `:id` routes use the generic global `NOT_FOUND` code (no
 * leak-avoidance 404-vs-403 concern here - admin already has unrestricted
 * read/write access to every product/variant/order, unlike the owner-scoped
 * customer routes elsewhere in this project).
 */
