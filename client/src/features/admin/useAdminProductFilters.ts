import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { ProductStatus, ProductsSort, ProductType } from "@shared"
import { BROWSABLE_PRODUCT_TYPES } from "@/lib/constants"
import type { AdminProductListQuery } from "@/lib/api"

export const ADMIN_PRODUCTS_PAGE_SIZE = 20

const SORT_VALUES: readonly ProductsSort[] = ["price-asc", "price-desc", "newest"]
const STATUS_VALUES: readonly ProductStatus[] = ["active", "draft", "archived"]

/**
 * `type` filter accepts `CUSTOM_BUILD` too (unlike the public Shop filter's
 * `BROWSABLE_PRODUCT_TYPES`) - admin needs to see/manage configurator output
 * rows if any exist, not just the customer-browsable subset.
 */
const ADMIN_PRODUCT_TYPES: readonly ProductType[] = [...BROWSABLE_PRODUCT_TYPES, "CUSTOM_BUILD"]

export interface AdminProductFilters {
  type: ProductType | undefined
  status: ProductStatus | undefined
  search: string
  sort: ProductsSort
  page: number
}

function parseType(value: string | null): ProductType | undefined {
  if (!value) return undefined
  return (ADMIN_PRODUCT_TYPES as readonly string[]).includes(value) ? (value as ProductType) : undefined
}

function parseStatus(value: string | null): ProductStatus | undefined {
  if (!value) return undefined
  return (STATUS_VALUES as readonly string[]).includes(value) ? (value as ProductStatus) : undefined
}

function parseSort(value: string | null): ProductsSort {
  return value !== null && SORT_VALUES.includes(value as ProductsSort) ? (value as ProductsSort) : "newest"
}

/** Same URL-synced pattern as `useShopFilters` - filtered/paged admin views stay shareable/bookmarkable and survive a refresh. */
export function useAdminProductFilters(): {
  filters: AdminProductFilters
  setFilters: (partial: Partial<AdminProductFilters>) => void
  apiQuery: AdminProductListQuery
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: AdminProductFilters = useMemo(() => {
    const page = Number(searchParams.get("page") ?? "1")
    return {
      type: parseType(searchParams.get("type")),
      status: parseStatus(searchParams.get("status")),
      search: searchParams.get("search") ?? "",
      sort: parseSort(searchParams.get("sort")),
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
    }
  }, [searchParams])

  const setFilters = useCallback(
    (partial: Partial<AdminProductFilters>) => {
      setSearchParams((prev) => {
        const current: AdminProductFilters = {
          type: parseType(prev.get("type")),
          status: parseStatus(prev.get("status")),
          search: prev.get("search") ?? "",
          sort: parseSort(prev.get("sort")),
          page: Number(prev.get("page") ?? "1"),
        }
        const merged = { ...current, ...partial }
        const nextPage = "page" in partial ? merged.page : 1

        const next = new URLSearchParams()
        if (merged.type) next.set("type", merged.type)
        if (merged.status) next.set("status", merged.status)
        if (merged.search) next.set("search", merged.search)
        if (merged.sort !== "newest") next.set("sort", merged.sort)
        if (nextPage > 1) next.set("page", String(nextPage))
        return next
      })
    },
    [setSearchParams],
  )

  const apiQuery: AdminProductListQuery = useMemo(
    () => ({
      type: filters.type,
      status: filters.status,
      search: filters.search || undefined,
      sort: filters.sort,
      page: filters.page,
      pageSize: ADMIN_PRODUCTS_PAGE_SIZE,
    }),
    [filters],
  )

  return { filters, setFilters, apiQuery }
}
