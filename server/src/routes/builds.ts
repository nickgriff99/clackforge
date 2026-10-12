import {
  ApiErrorSchema,
  BuildAccentKeysSchema,
  BuildDetailResponseSchema,
  BuildSelectionsSchema,
  CreateBuildResponseSchema,
  CreateCustomBuildInputSchema,
  DEFAULT_CATALOG,
  RenameBuildResponseSchema,
  RenameSavedBuildInputSchema,
  SavedBuildsListResponseSchema,
  calculatePrice,
  getOptionById,
  type BuildConfig,
  type BuildLayoutId,
  type CustomBuild as CustomBuildWire,
  type PriceResult,
  type SavedBuild as SavedBuildWire,
} from "@shared"
import type { CustomBuild as PrismaCustomBuild } from "@prisma/client"
import { Router, type Response } from "express"
import { prisma } from "../db/prisma"
import { renderBuildOgImageSvg } from "../lib/ogImage"
import { requireAuth } from "../middleware/requireAuth"

export const buildsRouter = Router()

function notFound(res: Response, message = "Build not found"): void {
  res.status(404).json(ApiErrorSchema.parse({ error: { message, code: "NOT_FOUND" } }))
}

/**
 * Prisma `CustomBuild` row -> wire `CustomBuild` (`BuildConfig` + identity).
 * `selections`/`accentKeys` are re-parsed through their Zod schemas because
 * a Prisma `Json` column is untyped storage - same pattern as
 * `toOrderStatus`/`toAuthUser` elsewhere in this app. `layout`/
 * `configVersion` are cast/renamed rather than re-parsed since they're
 * plain typed columns, not Json - the top-level response schema's own
 * `.parse()` call is what actually validates `layout` against
 * `BuildLayoutIdSchema`.
 */
function toWireBuild(row: PrismaCustomBuild, totalPriceOverride?: number): CustomBuildWire {
  return {
    id: row.id,
    userId: row.userId,
    productId: row.productId,
    layout: row.layout as BuildLayoutId,
    selections: BuildSelectionsSchema.parse(row.selections),
    accentKeys: BuildAccentKeysSchema.parse(row.accentKeys),
    version: row.configVersion,
    totalPrice: totalPriceOverride ?? row.totalPrice,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  }
}

function toWireSavedBuild(row: {
  id: string
  userId: string
  customBuildId: string
  label: string
  isPublic: boolean
  createdAt: Date
}): SavedBuildWire {
  return {
    id: row.id,
    userId: row.userId,
    customBuildId: row.customBuildId,
    label: row.label,
    isPublic: row.isPublic,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * POST /api/builds - no client-supplied price is ever read:
 * `CreateCustomBuildInputSchema` omits `totalPrice` entirely, and
 * `calculatePrice`'s own `subtotal` is the only value ever written to
 * `CustomBuild.totalPrice` (see server/src/lib/pricing.ts).
 */
buildsRouter.post("/api/builds", requireAuth, async (req, res, next) => {
  try {
    const input = CreateCustomBuildInputSchema.parse(req.body)
    const userId = req.user!.id

    const product = await prisma.product.findUnique({ where: { id: input.productId } })
    if (!product || product.status !== "ACTIVE") {
      notFound(res, "Product not found")
      return
    }

    // `totalPrice: 0` is throwaway filler - calculatePrice computes its own
    // subtotal and never reads this field. Passing the already-Zod-validated
    // `input` directly (plus the one filler key) avoids hand-constructing a
    // second BuildConfig-shaped object.
    const priceResult = calculatePrice({ ...input, totalPrice: 0 }, DEFAULT_CATALOG, {
      productId: product.id,
      priceCents: product.basePrice,
    })

    if (!priceResult.ok) {
      // Reuses PricingErrorCodeSchema's 5 values as the API error code
      // directly - no second, parallel enum for the same failure modes.
      // Nothing is written to the DB on this path.
      res.status(400).json(ApiErrorSchema.parse({ error: { message: priceResult.error.message, code: priceResult.error.code } }))
      return
    }

    const { build, savedBuild } = await prisma.$transaction(async (tx) => {
      const build = await tx.customBuild.create({
        data: {
          userId,
          productId: input.productId,
          layout: input.layout,
          selections: input.selections,
          accentKeys: input.accentKeys,
          configVersion: input.version,
          totalPrice: priceResult.subtotal,
          name: input.label ?? null,
        },
      })

      const savedBuild = input.label
        ? await tx.savedBuild.create({
            data: {
              userId,
              customBuildId: build.id,
              label: input.label,
              isPublic: false,
            },
          })
        : null

      return { build, savedBuild }
    })

    res.status(201).json(
      CreateBuildResponseSchema.parse({
        build: toWireBuild(build),
        price: { lineItems: priceResult.lineItems, subtotal: priceResult.subtotal },
        savedBuild: savedBuild ? toWireSavedBuild(savedBuild) : null,
      }),
    )
  } catch (err) {
    next(err)
  }
})

// GET /api/builds - Account page list. Joined via SavedBuild (not a direct
// CustomBuild.userId query) because an unsaved "share-only" build (minted
// via POST /api/builds with no label) must never appear here - PATCH/
// DELETE below gate on SavedBuild.userId for the same reason.
buildsRouter.get("/api/builds", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id
    const rows = await prisma.savedBuild.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { customBuild: true },
    })

    const builds = rows.map((row) => ({
      id: row.customBuild.id,
      label: row.label,
      layout: row.customBuild.layout as BuildLayoutId,
      totalPrice: row.customBuild.totalPrice,
      createdAt: row.customBuild.createdAt.toISOString(),
    }))

    res.status(200).json(SavedBuildsListResponseSchema.parse({ builds }))
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/builds/:id - public (no auth): the cuid itself is the access
 * control, same trust model as Figma/Docs "anyone with the link". Recomputes
 * calculatePrice fresh on every read - never serves the stored totalPrice as
 * truth - so a share link never shows stale pricing after a catalog change.
 * A failed recompute (stale option id) still returns 200 with the
 * last-known-good stored price as a flagged-stale fallback, not an error.
 */
buildsRouter.get("/api/builds/:id", async (req, res, next) => {
  try {
    const { id } = req.params
    const row = await prisma.customBuild.findUnique({ where: { id } })
    if (!row) {
      notFound(res)
      return
    }

    const config: BuildConfig = {
      version: row.configVersion,
      productId: row.productId,
      layout: row.layout as BuildLayoutId,
      selections: BuildSelectionsSchema.parse(row.selections),
      accentKeys: BuildAccentKeysSchema.parse(row.accentKeys),
      totalPrice: row.totalPrice,
    }

    // CustomBuild.productId -> Product is a required, non-SetNull relation
    // (Restrict by default), so the referenced product can't normally be
    // deleted out from under a saved build. Handled defensively anyway,
    // consistent with this route's own "never throw, degrade to the stored
    // fallback" contract rather than assuming the FK constraint forever holds.
    const product = await prisma.product.findUnique({ where: { id: row.productId } })
    const price: PriceResult = product
      ? calculatePrice(config, DEFAULT_CATALOG, { productId: product.id, priceCents: product.basePrice })
      : {
          ok: false,
          error: { code: "PRODUCT_MISMATCH", message: "The product this build references no longer exists." },
        }

    const build = toWireBuild(row, price.ok ? price.subtotal : row.totalPrice)

    res.status(200).json(BuildDetailResponseSchema.parse({ build, price }))
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/builds/:id - rename only. Gates on SavedBuild.userId, not
 * CustomBuild.userId, and returns 404 (never 403) whether the id doesn't
 * exist, isn't saved, or belongs to someone else. Writes `label` to both
 * CustomBuild.name and SavedBuild.label in one transaction - these two
 * columns are locked to always match (CreateCustomBuildInputSchema's doc
 * comment in build.ts).
 */
buildsRouter.patch<{ id: string }>("/api/builds/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const input = RenameSavedBuildInputSchema.parse(req.body)
    const userId = req.user!.id

    const savedBuild = await prisma.savedBuild.findFirst({
      where: { customBuildId: id, userId },
      include: { customBuild: true },
    })
    if (!savedBuild) {
      notFound(res)
      return
    }

    const [updatedCustomBuild] = await prisma.$transaction([
      prisma.customBuild.update({ where: { id }, data: { name: input.label } }),
      prisma.savedBuild.update({ where: { id: savedBuild.id }, data: { label: input.label } }),
    ])

    res.status(200).json(
      RenameBuildResponseSchema.parse({
        build: {
          id: updatedCustomBuild.id,
          label: input.label,
          layout: updatedCustomBuild.layout as BuildLayoutId,
          totalPrice: updatedCustomBuild.totalPrice,
          createdAt: updatedCustomBuild.createdAt.toISOString(),
        },
      }),
    )
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/builds/:id - same ownership gate as PATCH. Deletes only the
 * CustomBuild row: SavedBuild.customBuildId's FK is onDelete: Cascade (its
 * SavedBuild row disappears automatically) and CartItem/OrderItem.customBuildId
 * are both onDelete: SetNull (no FK can block this delete). No extra cleanup
 * code needed - the DB already handles both.
 */
buildsRouter.delete<{ id: string }>("/api/builds/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const savedBuild = await prisma.savedBuild.findFirst({ where: { customBuildId: id, userId } })
    if (!savedBuild) {
      notFound(res)
      return
    }

    await prisma.customBuild.delete({ where: { id } })

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/builds/:id/og-image - public, optional feature. Ships as
 * `image/svg+xml` (see server/src/lib/ogImage.ts for why SVG over PNG).
 * Error path stays JSON even though success is binary - ordinary REST mix,
 * same as most image/CDN endpoints.
 */
buildsRouter.get("/api/builds/:id/og-image", async (req, res, next) => {
  try {
    const { id } = req.params
    const row = await prisma.customBuild.findUnique({ where: { id } })
    if (!row) {
      notFound(res)
      return
    }

    const product = await prisma.product.findUnique({ where: { id: row.productId } })
    const selections = BuildSelectionsSchema.parse(row.selections)
    const layoutLabel = DEFAULT_CATALOG.layoutLabels[row.layout as BuildLayoutId] ?? row.layout

    const switchOption = selections.switches ? getOptionById(selections.switches) : undefined
    const keycapOption = selections.keycaps ? getOptionById(selections.keycaps) : undefined
    const plateOption = selections.plate ? getOptionById(selections.plate) : undefined
    const caseMaterialOption = selections.caseMaterial ? getOptionById(selections.caseMaterial) : undefined
    const caseColorOption = selections.caseColor ? getOptionById(selections.caseColor) : undefined
    const cableOption = selections.cable ? getOptionById(selections.cable) : undefined

    const specLines = [
      caseMaterialOption ? { label: "Case", value: caseMaterialOption.label } : null,
      plateOption ? { label: "Plate", value: plateOption.label } : null,
      switchOption ? { label: "Switches", value: switchOption.label } : null,
      keycapOption ? { label: "Keycaps", value: keycapOption.label } : null,
    ].filter((line): line is { label: string; value: string } => line !== null)

    const svg = renderBuildOgImageSvg({
      productName: product?.name ?? "Custom build",
      buildLabel: row.name ?? "Unsaved build",
      layoutLabel,
      priceDollars: (row.totalPrice / 100).toFixed(2),
      specLines,
      caseSwatchHex: caseColorOption?.swatchHex ?? "#0b0d13",
      cableSwatchHex: cableOption?.swatchHex ?? "#15181f",
    })

    res.status(200).type("image/svg+xml").send(svg)
  } catch (err) {
    next(err)
  }
})
