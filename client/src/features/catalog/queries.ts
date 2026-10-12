import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ApiRequestError, fetchProductBySlug, fetchProducts, type ProductListQuery } from "@/lib/api"

/**
 * Stable query key factory - keeps `useProducts`/invalidation callers from
 * hand-rolling the key shape (and drifting) in more than one place.
 */
export const catalogKeys = {
  all: ["products"] as const,
  list: (query: ProductListQuery) => [...catalogKeys.all, "list", query] as const,
  detail: (slug: string) => [...catalogKeys.all, "detail", slug] as const,
}

/**
 * `placeholderData: keepPreviousData` keeps the current page's products on
 * screen (instead of flashing the loading skeleton) while a new
 * page/filter combination is in flight - always re-fetches per
 * filter/page change, never slices a single fetched list client-side.
 */
export function useProducts(query: ProductListQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: catalogKeys.list(query),
    queryFn: () => fetchProducts(query),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  })
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.detail(slug ?? ""),
    queryFn: () => fetchProductBySlug(slug ?? ""),
    enabled: slug !== undefined && slug.length > 0,
    retry: (failureCount, error) => {
      // Don't retry a real 404 - retrying a "this slug doesn't exist" error
      // just delays showing the not-found state for no benefit.
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}
