import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { ProductsSort, ProductType } from "@shared"
import { BROWSABLE_PRODUCT_TYPES } from "@/lib/constants"
import type { ProductListQuery } from "@/lib/api"

export const DEFAULT_PAGE_SIZE = 12

const SORT_VALUES: readonly ProductsSort[] = ["price-asc", "price-desc", "newest"]

/**
 * All filter/sort/page state the Shop page needs, synced to
 * `useSearchParams` so filtered views are shareable/bookmarkable and
 * survive a refresh - never fetch once and slice/filter client-side.
 * `minPrice`/`maxPrice` are cents, same unit as everywhere else in the
 * app - the price inputs convert to/from dollars only at the input
 * boundary.
 */
export interface ShopFilters {
  type: ProductType | undefined
  minPrice: number | undefined
  maxPrice: number | undefined
  inStock: boolean
  sort: ProductsSort
  page: number
}

function parseType(value: string | null): ProductType | undefined {
  if (!value) return undefined
  return (BROWSABLE_PRODUCT_TYPES as readonly string[]).includes(value) ? (value as ProductType) : undefined
}

function parseSort(value: string | null): ProductsSort {
  return value !== null && SORT_VALUES.includes(value as ProductsSort) ? (value as ProductsSort) : "newest"
}

function parseNonNegativeInt(value: string | null): number | undefined {
  if (value === null) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

export function useShopFilters(): {
  filters: ShopFilters
  setFilters: (partial: Partial<ShopFilters>) => void
  apiQuery: ProductListQuery
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: ShopFilters = useMemo(() => {
    const page = Number(searchParams.get("page") ?? "1")
    return {
      type: parseType(searchParams.get("type")),
      minPrice: parseNonNegativeInt(searchParams.get("minPrice")),
      maxPrice: parseNonNegativeInt(searchParams.get("maxPrice")),
      inStock: searchParams.get("inStock") === "true",
      sort: parseSort(searchParams.get("sort")),
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
    }
  }, [searchParams])

  const setFilters = useCallback(
    (partial: Partial<ShopFilters>) => {
      setSearchParams((prev) => {
        const current: ShopFilters = {
          type: parseType(prev.get("type")),
          minPrice: parseNonNegativeInt(prev.get("minPrice")),
          maxPrice: parseNonNegativeInt(prev.get("maxPrice")),
          inStock: prev.get("inStock") === "true",
          sort: parseSort(prev.get("sort")),
          page: Number(prev.get("page") ?? "1"),
        }
        const merged = { ...current, ...partial }
        // Any change other than an explicit page change goes back to page 1 -
        // a filter/sort change makes the old page number meaningless.
        const nextPage = "page" in partial ? merged.page : 1

        const next = new URLSearchParams()
        if (merged.type) next.set("type", merged.type)
        if (merged.minPrice !== undefined) next.set("minPrice", String(merged.minPrice))
        if (merged.maxPrice !== undefined) next.set("maxPrice", String(merged.maxPrice))
        if (merged.inStock) next.set("inStock", "true")
        if (merged.sort !== "newest") next.set("sort", merged.sort)
        if (nextPage > 1) next.set("page", String(nextPage))
        return next
      })
    },
    [setSearchParams],
  )

  // The server 400s if minPrice > maxPrice. Clamp client-side so a
  // transient "min bigger than max" mid-typing state never fires a doomed
  // request - the UI just drops the invalid bound until it's fixed.
  const apiQuery: ProductListQuery = useMemo(() => {
    const { minPrice, maxPrice } = filters
    const validRange = minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice
    return {
      type: filters.type,
      minPrice: validRange ? minPrice : undefined,
      maxPrice: validRange ? maxPrice : undefined,
      inStock: filters.inStock ? true : undefined,
      sort: filters.sort,
      page: filters.page,
      pageSize: DEFAULT_PAGE_SIZE,
    }
  }, [filters])

  return { filters, setFilters, apiQuery }
}
