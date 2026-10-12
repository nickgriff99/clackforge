import { z } from "zod"
import { CentsSchema, CurrencySchema, IdSchema, IsoDateTimeSchema } from "./common"

/**
 * Catalog product type.
 *
 * CONTRACT DRIFT CALLED OUT: this replaces the
 * `"keyboard" | "switch" | "keycap" | "accessory"` placeholder the client
 * stub used for `ProductCategory` in `client/src/lib/types.ts`. That stub
 * predates the real product spec. The real spec names five product types,
 * not four, and uses different casing/values. Field name `category` is kept
 * (minimizes churn in client code already reading `.category`), but the
 * enum values below are the ones that ship - don't read the old four-value
 * stub as truth.
 */
export const ProductTypeSchema = z.enum([
  "KIT",
  "SWITCH",
  "KEYCAP_SET",
  "ACCESSORY",
  "CUSTOM_BUILD",
])
export type ProductType = z.infer<typeof ProductTypeSchema>

/** Admin-only lifecycle state - not exposed on the public summary/detail shapes. */
export const ProductStatusSchema = z.enum(["active", "draft", "archived"])
export type ProductStatus = z.infer<typeof ProductStatusSchema>

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Full DB-shape product record (admin views, internal use). */
export const ProductSchema = z.object({
  id: IdSchema,
  slug: z.string().regex(slugPattern, "slug must be lowercase-kebab-case"),
  name: z.string().min(1),
  tagline: z.string().min(1),
  description: z.string().min(1),
  category: ProductTypeSchema,
  basePrice: CentsSchema,
  currency: CurrencySchema,
  images: z.array(z.string().url()).default([]),
  specs: z.record(z.string(), z.string()),
  isConfigurable: z.boolean(),
  status: ProductStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type Product = z.infer<typeof ProductSchema>

/**
 * `GET /api/products` list-item shape - mirrors the client's
 * `ProductSummary` type in `client/src/lib/types.ts` field-for-field,
 * except `category`'s enum values (see drift note above). Delete the
 * client stub once this lands.
 *
 * `inStock` (computed - NOT a DB column): a Product row itself has no stock
 * field, stock lives on `Variant`. Derivation rule, same on summary and
 * detail:
 *   - zero variants on the product  -> inStock = true (unconfigurable item,
 *     always orderable - e.g. a tool/accessory with no SKU variants)
 *   - one or more variants          -> inStock = true iff at least one
 *     variant has stock > 0, else false
 * The route handler must compute this server-side (aggregate variant stock
 * per product) - it is NOT derivable from the fields already on
 * `ProductSummarySchema` alone, since the summary shape doesn't carry the
 * variants array. Watch for this: a plain `findMany` with no variant
 * include on `GET /api/products` will fail Zod validation on the missing
 * field - the query must fetch/aggregate variant stock too.
 */
export const ProductSummarySchema = ProductSchema.pick({
  id: true,
  slug: true,
  name: true,
  tagline: true,
  category: true,
  basePrice: true,
  currency: true,
  specs: true,
  isConfigurable: true,
}).extend({
  inStock: z.boolean(),
})
export type ProductSummary = z.infer<typeof ProductSummarySchema>

export const VariantSchema = z.object({
  id: IdSchema,
  productId: IdSchema,
  name: z.string().min(1),
  sku: z.string().min(1),
  /** Cents, added to the product's basePrice. Can be negative (discount SKU). */
  priceDelta: z.number().int(),
  attributes: z.record(z.string(), z.string()),
  stock: z.number().int().min(0),
  image: z.string().url().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type Variant = z.infer<typeof VariantSchema>

/**
 * `GET /api/products/:slug` detail shape - summary + description/images/variants.
 * `inStock` is inherited from `ProductSummarySchema` (same derivation rule);
 * unlike the list route, this handler DOES already fetch `variants`, so
 * computing it here is a one-line `variants.length === 0 || variants.some(v
 * => v.stock > 0)` with no extra query needed.
 */
export const ProductDetailSchema = ProductSummarySchema.extend({
  description: ProductSchema.shape.description,
  images: ProductSchema.shape.images,
  variants: z.array(VariantSchema).default([]),
})
export type ProductDetail = z.infer<typeof ProductDetailSchema>

/**
 * `GET /api/products` query params. Express `req.query` hands
 * every value over as a string (or `string[]`/undefined) regardless of
 * conceptual type, so every field below coerces from that wire format -
 * don't swap in `z.boolean()`/`z.number()` directly or a real request will
 * fail validation on e.g. `?page=2` (string "2", not a number).
 *
 * `type` filters on the `Product.category` column (query param kept as
 * `type` to match the public filter language used in Shop UI/URL - see the
 * `category` field-name drift note above for why the DB/response field
 * itself stays `category`).
 */
export const ProductsSortSchema = z.enum(["price-asc", "price-desc", "newest"])
export type ProductsSort = z.infer<typeof ProductsSortSchema>

export const ProductsQuerySchema = z
  .object({
    type: ProductTypeSchema.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    /**
     * Literal "true"/"false" strings only. Do NOT use `z.coerce.boolean()`
     * here - it does `Boolean(value)`, so the string `"false"` (truthy,
     * non-empty) coerces to `true`. That bug would silently invert this
     * filter for exactly the query string a filter-off UI state would send.
     */
    inStock: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    sort: ProductsSortSchema.optional().default("newest"),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(12),
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: "minPrice must be <= maxPrice",
    path: ["minPrice"],
  })
export type ProductsQuery = z.infer<typeof ProductsQuerySchema>
