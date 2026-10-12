import { useMemo } from "react"
import {
  calculatePrice,
  CURRENT_BUILD_CONFIG_VERSION,
  DEFAULT_CATALOG,
  type BuildConfig,
  type PriceResult,
} from "@shared"
import { useProduct } from "@/features/catalog/queries"
import { BASE_KIT_SLUG_BY_LAYOUT } from "./baseKits"
import { useConfiguratorStore } from "./store"

/**
 * Combines the live configurator selections (Zustand) with the active
 * layout's base-kit product (TanStack Query - never trust/duplicate a
 * live price, same rule the cart already follows) and runs the shared
 * pricing engine. This is the one hook every price-displaying piece of UI
 * (`routes/Build.tsx`'s running total, `ReviewSpecSheet`) should read
 * through - never re-derive price locally.
 */
export function useBuildPricing() {
  const layout = useConfiguratorStore((s) => s.layout)
  const selections = useConfiguratorStore((s) => s.selections)

  const slug = BASE_KIT_SLUG_BY_LAYOUT[layout]
  const { data, isPending, isError, error } = useProduct(slug)
  const product = data?.product

  const config: BuildConfig | null = useMemo(() => {
    if (!product) return null
    return {
      version: CURRENT_BUILD_CONFIG_VERSION,
      productId: product.id,
      layout,
      selections,
      accentKeys: {},
      // Placeholder - `calculatePrice` never reads this field back, it only
      // ever WRITES a fresh subtotal into its return value.
      totalPrice: 0,
    }
  }, [product, layout, selections])

  const priceResult: PriceResult | null = useMemo(() => {
    if (!config || !product) return null
    return calculatePrice(config, DEFAULT_CATALOG, { productId: product.id, priceCents: product.basePrice })
  }, [config, product])

  return { layout, selections, product, config, priceResult, isPending, isError, error }
}
