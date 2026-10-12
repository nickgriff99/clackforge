import {
  AdminProductResponseSchema,
  AdminProductsListResponseSchema,
  AdminProductsQuerySchema,
  AdminVariantResponseSchema,
  ApiErrorSchema,
  CreateProductInputSchema,
  CreateVariantInputSchema,
  ProductDetailResponseSchema,
  ProductsListResponseSchema,
  ProductsQuerySchema,
  UpdateProductInputSchema,
  UpdateVariantInputSchema,
  type AdminProductDetail,
  type AdminProductListItem,
  type ProductDetail,
  type ProductSummary,
  type ProductStatus,
  type Variant,
} from "@shared"
import type { Prisma, Product as PrismaProduct, ProductStatus as PrismaProductStatus, Variant as PrismaVariant } from "@prisma/client"
import { Router } from "express"
import { prisma } from "../db/prisma"
import { requireAdmin } from "../middleware/requireAdmin"
import { requireAuth } from "../middleware/requireAuth"

export const productsRouter = Router()

/**
 * Admin product/variant CRUD wire<->DB status mapping, same pattern as
 * `toOrderStatus()`/`STATUS_MAP` in routes/orders.ts. `ProductStatusSchema`
 * (shared/src/product.ts) is lowercase wire; Prisma's `ProductStatus` enum
 * is uppercase DB. Both directions needed here (reads map DB->wire, writes
 * map wire->DB), unlike orders.ts which only ever reads.
 */
const PRODUCT_STATUS_TO_WIRE: Record<PrismaProductStatus, ProductStatus> = {
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
}
const PRODUCT_STATUS_TO_DB: Record<ProductStatus, PrismaProductStatus> = {
  active: "ACTIVE",
  draft: "DRAFT",
  archived: "ARCHIVED",
}

/**
 * Prisma's `Json` columns (`specs`, `Variant.attributes`) type as
 * `Prisma.JsonValue` (a wide union), but this app only ever writes them as
 * flat string maps (see prisma/seed.ts) - admin/CRUD write paths in later
 * phases must keep that invariant. Narrowing cast here, not a runtime
 * assertion, because the Zod response schema (`ProductSummarySchema`/
 * `ProductDetailSchema`) validates the actual shape before it ever reaches
 * the wire, so a bad write would fail loudly at response time, not silently.
 */
function asStringRecord(value: unknown): Record<string, string> {
  return value as Record<string, string>
}

/**
 * Prisma row -> wire `Variant` shape. Extracted from
 * `GET /api/products/:slug`'s former inline mapping so the admin routes
 * below don't duplicate it.
 */
function toVariant(v: PrismaVariant): Variant {
  return {
    id: v.id,
    productId: v.productId,
    name: v.name,
    sku: v.sku,
    priceDelta: v.priceDelta,
    attributes: asStringRecord(v.attributes),
    stock: v.stock,
    image: v.image,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }
}

/**
 * Prisma row -> wire `AdminProductDetail` shape (full product, incl. raw
 * `status`, no `inStock` derivation - admin views need the real lifecycle
 * state, not the customer-facing boolean). `variants` defaults to `[]` when
 * the caller didn't `include` them (e.g. right after `create`).
 */
function toAdminProductDetail(row: PrismaProduct, variants: PrismaVariant[] = []): AdminProductDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    basePrice: row.basePrice,
    currency: row.currency,
    images: row.images,
    specs: asStringRecord(row.specs),
    isConfigurable: row.isConfigurable,
    status: PRODUCT_STATUS_TO_WIRE[row.status],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    variants: variants.map(toVariant),
  }
}

productsRouter.get("/api/products", async (req, res, next) => {
  try {
    // ZodError thrown here propagates to `next(err)` in the catch block below,
    // which `errorHandler` already turns into a 400 VALIDATION_ERROR envelope
    // (see server/src/middleware/errorHandler.ts) - no separate manual 400
    // branch needed for bad query params.
    const query = ProductsQuerySchema.parse(req.query)
    const { type, minPrice, maxPrice, inStock, sort, page, pageSize } = query

    const where: Prisma.ProductWhereInput = { status: "ACTIVE" }
    if (type) where.category = type
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.basePrice = {
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
      }
    }
    // `inStock` isn't a DB column (see ProductSummarySchema doc comment) -
    // derive it via the variants relation so filtering, counting, and
    // pagination all stay DB-side and consistent with each other.
    if (inStock === true) {
      where.OR = [{ variants: { none: {} } }, { variants: { some: { stock: { gt: 0 } } } }]
    } else if (inStock === false) {
      where.AND = [{ variants: { some: {} } }, { variants: { every: { stock: 0 } } }]
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price-asc" ? { basePrice: "asc" } : sort === "price-desc" ? { basePrice: "desc" } : { createdAt: "desc" }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variants: { select: { stock: true } } },
      }),
      prisma.product.count({ where }),
    ])

    // ProductSummarySchema has no raw `variants` field (summary must not leak
    // full variant rows) - only the derived boolean crosses the wire.
    const products: ProductSummary[] = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      category: p.category,
      basePrice: p.basePrice,
      currency: p.currency,
      specs: asStringRecord(p.specs),
      isConfigurable: p.isConfigurable,
      inStock: p.variants.length === 0 || p.variants.some((v) => v.stock > 0),
    }))

    res.json(ProductsListResponseSchema.parse({ products, total, page, pageSize }))
  } catch (err) {
    next(err)
  }
})

productsRouter.get("/api/products/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params
    if (!slug) {
      res.status(400).json(ApiErrorSchema.parse({ error: { message: "Missing slug", code: "BAD_REQUEST" } }))
      return
    }

    const row = await prisma.product.findUnique({
      where: { slug },
      include: { variants: true },
    })

    if (!row || row.status !== "ACTIVE") {
      res
        .status(404)
        .json(ApiErrorSchema.parse({ error: { message: `Product "${slug}" not found`, code: "NOT_FOUND" } }))
      return
    }

    const variants: Variant[] = row.variants.map(toVariant)

    const product: ProductDetail = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      category: row.category,
      basePrice: row.basePrice,
      currency: row.currency,
      specs: asStringRecord(row.specs),
      isConfigurable: row.isConfigurable,
      inStock: variants.length === 0 || variants.some((v) => v.stock > 0),
      description: row.description,
      images: row.images,
      variants,
    }

    res.json(ProductDetailResponseSchema.parse({ product }))
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// Admin product/variant CRUD. Every route below requires both
// `requireAuth` and `requireAdmin`, in that order (401 before 403 - see
// requireAdmin.ts's doc comment), and is added to this router rather than
// a new one since productsRouter is already mounted early in app.ts.
// ---------------------------------------------------------------------------

function notFoundProduct(id: string | undefined): { message: string; code: "NOT_FOUND" } {
  return { message: `Product "${id ?? ""}" not found`, code: "NOT_FOUND" }
}

function notFoundVariant(id: string | undefined): { message: string; code: "NOT_FOUND" } {
  return { message: `Variant "${id ?? ""}" not found`, code: "NOT_FOUND" }
}

// GET /api/admin/products - paginated, filterable by type/status/search.
// Unlike the public list above, there is NO implicit `status: "ACTIVE"`
// filter - admin must see draft/archived rows too (that's the whole point of
// this screen), scoped only by whatever `status` the query explicitly asks for.
productsRouter.get("/api/admin/products", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const query = AdminProductsQuerySchema.parse(req.query)
    const { type, status, search, sort, page, pageSize } = query

    const where: Prisma.ProductWhereInput = {}
    if (type) where.category = type
    if (status) where.status = PRODUCT_STATUS_TO_DB[status]
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ]
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price-asc" ? { basePrice: "asc" } : sort === "price-desc" ? { basePrice: "desc" } : { createdAt: "desc" }

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variants: { select: { stock: true } }, _count: { select: { variants: true } } },
      }),
      prisma.product.count({ where }),
    ])

    const products: AdminProductListItem[] = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      basePrice: p.basePrice,
      currency: p.currency,
      status: PRODUCT_STATUS_TO_WIRE[p.status],
      isConfigurable: p.isConfigurable,
      updatedAt: p.updatedAt.toISOString(),
      variantCount: p._count.variants,
      totalStock: p.variants.reduce((sum, v) => sum + v.stock, 0),
    }))

    res.status(200).json(AdminProductsListResponseSchema.parse({ products, total, page, pageSize }))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/products - 409 SLUG_TAKEN checked BEFORE insert (same
// convention as EMAIL_TAKEN in auth.ts), not a caught Postgres unique
// violation surfacing as a raw 500.
productsRouter.post("/api/admin/products", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = CreateProductInputSchema.parse(req.body)

    const existing = await prisma.product.findUnique({ where: { slug: input.slug } })
    if (existing) {
      res.status(409).json(
        ApiErrorSchema.parse({
          error: { message: `Slug "${input.slug}" is already taken`, code: "SLUG_TAKEN" },
        }),
      )
      return
    }

    const created = await prisma.product.create({
      data: {
        slug: input.slug,
        name: input.name,
        tagline: input.tagline,
        description: input.description,
        category: input.category,
        basePrice: input.basePrice,
        currency: input.currency,
        images: input.images,
        specs: input.specs,
        isConfigurable: input.isConfigurable,
        status: PRODUCT_STATUS_TO_DB[input.status],
      },
    })

    res.status(201).json(AdminProductResponseSchema.parse({ product: toAdminProductDetail(created, []) }))
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/products/:id - full detail incl. variants. No status
// filter (unlike the public detail route) - admin can open any product
// regardless of lifecycle state.
productsRouter.get<{ id: string }>("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const row = await prisma.product.findUnique({ where: { id }, include: { variants: true } })
    if (!row) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundProduct(id) }))
      return
    }
    res.status(200).json(AdminProductResponseSchema.parse({ product: toAdminProductDetail(row, row.variants) }))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/products/:id - partial update, `slug` never accepted
// (see UpdateProductInputSchema's doc comment on why it's omitted, not
// `.optional()`'d). Every field below is `undefined` unless the caller sent
// it, and Prisma's `update` skips `undefined` keys, so a partial body only
// touches the fields it actually names.
productsRouter.patch<{ id: string }>("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const input = UpdateProductInputSchema.parse(req.body)

    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundProduct(id) }))
      return
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        name: input.name,
        tagline: input.tagline,
        description: input.description,
        category: input.category,
        basePrice: input.basePrice,
        currency: input.currency,
        images: input.images,
        specs: input.specs,
        isConfigurable: input.isConfigurable,
        status: input.status !== undefined ? PRODUCT_STATUS_TO_DB[input.status] : undefined,
      },
      include: { variants: true },
    })

    res.status(200).json(AdminProductResponseSchema.parse({ product: toAdminProductDetail(updated, updated.variants) }))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/products/:id - SOFT delete only (see shared/src/admin.ts's
// long doc comment above AdminCatalogErrorCodeSchema for exactly why a real
// DELETE is impossible here). Idempotent: re-archiving an already-archived
// product is a no-op 200, not an error.
productsRouter.delete<{ id: string }>("/api/admin/products/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const existing = await prisma.product.findUnique({ where: { id }, include: { variants: true } })
    if (!existing) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundProduct(id) }))
      return
    }

    const updated =
      existing.status === "ARCHIVED"
        ? existing
        : await prisma.product.update({ where: { id }, data: { status: "ARCHIVED" }, include: { variants: true } })

    res.status(200).json(AdminProductResponseSchema.parse({ product: toAdminProductDetail(updated, updated.variants) }))
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/products/:id/variants - 404 if the parent product doesn't
// exist, 409 SKU_TAKEN (checked before insert, same convention as SLUG_TAKEN
// above) if another variant (on any product) already owns that SKU -
// `Variant.sku` is globally `@unique` in schema.prisma, not scoped per-product.
productsRouter.post<{ id: string }>(
  "/api/admin/products/:id/variants",
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { id } = req.params
      const input = CreateVariantInputSchema.parse(req.body)

      const product = await prisma.product.findUnique({ where: { id } })
      if (!product) {
        res.status(404).json(ApiErrorSchema.parse({ error: notFoundProduct(id) }))
        return
      }

      const existingSku = await prisma.variant.findUnique({ where: { sku: input.sku } })
      if (existingSku) {
        res
          .status(409)
          .json(ApiErrorSchema.parse({ error: { message: `SKU "${input.sku}" is already taken`, code: "SKU_TAKEN" } }))
        return
      }

      const created = await prisma.variant.create({
        data: {
          productId: id,
          name: input.name,
          sku: input.sku,
          priceDelta: input.priceDelta,
          attributes: input.attributes,
          stock: input.stock,
          image: input.image ?? null,
        },
      })

      res.status(201).json(AdminVariantResponseSchema.parse({ variant: toVariant(created) }))
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/admin/variants/:id - partial update. SKU uniqueness re-checked
// only when the caller is actually changing it (and excludes this variant's
// own row from the conflict check, or renaming a variant to its own existing
// SKU would falsely 409).
productsRouter.patch<{ id: string }>("/api/admin/variants/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const input = UpdateVariantInputSchema.parse(req.body)

    const existing = await prisma.variant.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundVariant(id) }))
      return
    }

    if (input.sku !== undefined && input.sku !== existing.sku) {
      const skuOwner = await prisma.variant.findUnique({ where: { sku: input.sku } })
      if (skuOwner && skuOwner.id !== id) {
        res
          .status(409)
          .json(ApiErrorSchema.parse({ error: { message: `SKU "${input.sku}" is already taken`, code: "SKU_TAKEN" } }))
        return
      }
    }

    const updated = await prisma.variant.update({
      where: { id },
      data: {
        name: input.name,
        sku: input.sku,
        priceDelta: input.priceDelta,
        attributes: input.attributes,
        stock: input.stock,
        image: input.image,
      },
    })

    res.status(200).json(AdminVariantResponseSchema.parse({ variant: toVariant(updated) }))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/variants/:id - SOFT delete: `stock` -> 0, row never
// removed (same FK-RESTRICT reasoning as the product soft-delete above).
// Idempotent: a variant already at stock 0 is a no-op 200.
productsRouter.delete<{ id: string }>("/api/admin/variants/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const existing = await prisma.variant.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundVariant(id) }))
      return
    }

    const updated = existing.stock === 0 ? existing : await prisma.variant.update({ where: { id }, data: { stock: 0 } })

    res.status(200).json(AdminVariantResponseSchema.parse({ variant: toVariant(updated) }))
  } catch (err) {
    next(err)
  }
})
