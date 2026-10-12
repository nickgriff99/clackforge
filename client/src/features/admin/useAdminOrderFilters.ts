import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { OrderStatus } from "@shared"
import type { AdminOrderListQuery } from "@/lib/api"

export const ADMIN_ORDERS_PAGE_SIZE = 20

const STATUS_VALUES: readonly OrderStatus[] = ["Placed", "Building", "Shipped", "Delivered"]

function parseStatus(value: string | null): OrderStatus | undefined {
  if (!value) return undefined
  return (STATUS_VALUES as readonly string[]).includes(value) ? (value as OrderStatus) : undefined
}

export interface AdminOrderFilters {
  status: OrderStatus | undefined
  search: string
  page: number
}

/** Same URL-synced pattern as `useShopFilters`/`useAdminProductFilters`. */
export function useAdminOrderFilters(): {
  filters: AdminOrderFilters
  setFilters: (partial: Partial<AdminOrderFilters>) => void
  apiQuery: AdminOrderListQuery
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: AdminOrderFilters = useMemo(() => {
    const page = Number(searchParams.get("page") ?? "1")
    return {
      status: parseStatus(searchParams.get("status")),
      search: searchParams.get("search") ?? "",
      page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
    }
  }, [searchParams])

  const setFilters = useCallback(
    (partial: Partial<AdminOrderFilters>) => {
      setSearchParams((prev) => {
        const current: AdminOrderFilters = {
          status: parseStatus(prev.get("status")),
          search: prev.get("search") ?? "",
          page: Number(prev.get("page") ?? "1"),
        }
        const merged = { ...current, ...partial }
        const nextPage = "page" in partial ? merged.page : 1

        const next = new URLSearchParams()
        if (merged.status) next.set("status", merged.status)
        if (merged.search) next.set("search", merged.search)
        if (nextPage > 1) next.set("page", String(nextPage))
        return next
      })
    },
    [setSearchParams],
  )

  const apiQuery: AdminOrderListQuery = useMemo(
    () => ({
      status: filters.status,
      search: filters.search || undefined,
      page: filters.page,
      pageSize: ADMIN_ORDERS_PAGE_SIZE,
    }),
    [filters],
  )

  return { filters, setFilters, apiQuery }
}
