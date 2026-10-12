import type { CustomBuild, Product, Variant } from "@prisma/client"

/**
 * Single source of truth for "what does this cart/order line cost right
 * now" - shared by routes/cart.ts (add/merge) and routes/checkout.ts (the
 * final re-verification before charging; never trust a stored snapshot for
 * the actual charge).
 *
 * Variant-backed line: product.basePrice + variant.priceDelta (can be
 * negative - see Variant's schema.prisma doc comment).
 *
 * CustomBuild-backed line: uses the stored `CustomBuild.totalPrice` as-is.
 * This is safe because `POST /api/builds` is the only writer of that
 * column and always computes it server-side via
 * `calculatePrice(config, DEFAULT_CATALOG, basePrice)` - a forged/stale
 * total can't enter the DB through that route. `GET /api/builds/:id` goes
 * further and recomputes fresh on every read, never trusting even its own
 * stored value.
 *
 * Deliberate simplification: this function still reads the stored
 * `customBuild.totalPrice` instead of re-running `calculatePrice` on every
 * cart/checkout touch. The residual risk is narrow: if the catalog changes
 * after a build is saved but before it's added to cart or checked out, the
 * line still prices at the save-time number (same point-in-time snapshot
 * caveat documented in options.ts for `priceDeltaCents` generally).
 * Re-running `calculatePrice` here too would close that gap if catalog
 * changes become a real operational event.
 */
export function computeUnitPrice(product: Product, variant: Variant | null, customBuild: CustomBuild | null): number {
  if (customBuild) {
    return customBuild.totalPrice
  }
  return product.basePrice + (variant?.priceDelta ?? 0)
}

/**
 * Display name for a cart line. `CartItem` has no `name` column in
 * schema.prisma (only `OrderItem` does, snapshotted once at order-creation
 * time in routes/webhooks.ts), so this derives the display name live from
 * the current Product/Variant/CustomBuild row every time a cart is read.
 * That's a real behavioral deviation from a true snapshot: if a product is
 * renamed, every cart line referencing it shows the new name, not the name
 * at add-time. Acceptable here since product renames aren't a real
 * admin-flow scenario, but a true snapshot would need a schema migration
 * adding `CartItem.name`.
 */
export function deriveLineName(product: Product, variant: Variant | null, customBuild: CustomBuild | null): string {
  if (customBuild) return customBuild.name ?? `${product.name} (Custom Build)`
  if (variant) return `${product.name} (${variant.name})`
  return product.name
}
