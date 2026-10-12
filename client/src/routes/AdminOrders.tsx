import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { getNextOrderStatus, type AdminOrderSummary, type OrderStatus } from "@shared"
import { AdminTitle } from "@/components/seo/AdminTitle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ORDER_STATUS_BADGE_VARIANT, ORDER_STATUS_LABELS } from "@/features/orders/constants"
import { Pagination } from "@/features/catalog/Pagination"
import { formatCents } from "@/lib/utils"
import { ApiRequestError } from "@/lib/api"
import { useAdminOrders, useUpdateAdminOrderStatusMutation } from "@/features/admin/queries"
import { useAdminOrderFilters } from "@/features/admin/useAdminOrderFilters"

const ALL_STATUSES = "all"
const STATUS_OPTIONS: OrderStatus[] = ["Placed", "Building", "Shipped", "Delivered"]

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/**
 * One fixed "Mark as {next status}" action per row rather than a free-choice
 * select, so an invalid transition isn't even offered. `getNextOrderStatus`
 * is the same shared helper the server's status-update route validates
 * against, so the button can never offer a transition the server would
 * reject. Hidden entirely on `Delivered` (terminal), not just disabled.
 */
function MarkAsNextButton({ order }: { order: AdminOrderSummary }) {
  const mutation = useUpdateAdminOrderStatusMutation()
  const next = getNextOrderStatus(order.status)
  if (!next) return null

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ id: order.id, input: { status: next } })}
    >
      Mark as {next}
    </Button>
  )
}

export function AdminOrders() {
  const { filters, setFilters, apiQuery } = useAdminOrderFilters()
  const { data, isPending, isError, error, isPlaceholderData } = useAdminOrders(apiQuery)

  const columns = useMemo<ColumnDef<AdminOrderSummary>[]>(
    () => [
      {
        accessorKey: "orderNumber",
        header: "Order",
        // No admin order detail route exists - plain text, not a dead link.
        // The customer detail route (`/account/orders/:id`) is a different,
        // owner-scoped page and not reachable for an arbitrary order here.
        cell: ({ row }) => <span className="font-specs text-sm">#{row.original.orderNumber}</span>,
      },
      {
        id: "customer",
        header: "Customer",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.customerName ?? "n/a"}</span>
            <span className="text-xs text-muted-foreground">{row.original.customerEmail ?? "n/a"}</span>
          </div>
        ),
      },
      {
        accessorKey: "placedAt",
        header: "Placed",
        cell: ({ row }) => formatPlacedAt(row.original.placedAt),
      },
      {
        accessorKey: "itemCount",
        header: "Items",
      },
      {
        accessorKey: "total",
        header: "Total",
        cell: ({ row }) => formatCents(row.original.total, row.original.currency),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={ORDER_STATUS_BADGE_VARIANT[row.original.status]}>{ORDER_STATUS_LABELS[row.original.status]}</Badge>
        ),
      },
      {
        id: "actions",
        // `sr-only` text, not a visible "Actions" label - axe's
        // `empty-table-header` (minor) flagged the previous `header: ""`:
        // sighted users read this narrow button-only column visually fine,
        // but a screen reader navigating by column header announces
        // nothing for it. A real (if visually hidden) header name fixes
        // that without adding visual clutter to a column that's
        // intentionally unlabeled on screen.
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <MarkAsNextButton order={row.original} />,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6">
      <AdminTitle title="Orders" />
      <p className="text-sm text-muted-foreground">{data ? `${data.total} order${data.total === 1 ? "" : "s"}` : "Loading…"}</p>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-order-search">Search</Label>
          <Input
            id="admin-order-search"
            placeholder="Order number or email"
            className="w-full sm:w-60"
            defaultValue={filters.search}
            onBlur={(e) => setFilters({ search: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && setFilters({ search: e.currentTarget.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-order-status">Status</Label>
          <Select
            value={filters.status ?? ALL_STATUSES}
            onValueChange={(value) => setFilters({ status: value && value !== ALL_STATUSES ? (value as OrderStatus) : undefined })}
          >
            <SelectTrigger id="admin-order-status" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <p className="rounded-xl border border-dashed border-destructive/40 p-6 text-center text-sm text-destructive">
          {error instanceof ApiRequestError ? error.message : "Couldn't load orders right now."}
        </p>
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity duration-fast" : undefined}>
          <DataTable columns={columns} data={data?.orders ?? []} isLoading={isPending} emptyMessage="No orders match those filters." />
          {data && (
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(page) => setFilters({ page })} />
          )}
        </div>
      )}
    </div>
  )
}
