import { useMemo } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import type { AdminProductListItem, ProductType } from "@shared"
import { AdminTitle } from "@/components/seo/AdminTitle"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pagination } from "@/features/catalog/Pagination"
import { PRODUCT_TYPE_LABELS } from "@/lib/constants"
import { formatCents } from "@/lib/utils"
import { ApiRequestError } from "@/lib/api"
import { PRODUCT_STATUS_BADGE_VARIANT, PRODUCT_STATUS_LABELS } from "@/features/admin/constants"
import { CreateProductDialog } from "@/features/admin/CreateProductDialog"
import { useAdminProducts } from "@/features/admin/queries"
import { useAdminProductFilters } from "@/features/admin/useAdminProductFilters"

const ALL_TYPES = "all"
const ALL_STATUSES = "all"

/** `type` filter here intentionally includes `CUSTOM_BUILD` (unlike the public Shop filter) - admin manages the whole catalog, not just the browsable subset. */
const ADMIN_FILTER_TYPES: ProductType[] = ["KIT", "SWITCH", "KEYCAP_SET", "ACCESSORY", "CUSTOM_BUILD"]

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export function AdminProducts() {
  const { filters, setFilters, apiQuery } = useAdminProductFilters()
  const { data, isPending, isError, error, isPlaceholderData } = useAdminProducts(apiQuery)

  const columns = useMemo<ColumnDef<AdminProductListItem>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Link to={`/admin/products/${row.original.id}`} className="font-medium text-accent underline underline-offset-2">
              {row.original.name}
            </Link>
            <span className="font-specs text-xs text-muted-foreground">{row.original.slug}</span>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Type",
        cell: ({ row }) => PRODUCT_TYPE_LABELS[row.original.category],
      },
      {
        accessorKey: "basePrice",
        header: "Price",
        cell: ({ row }) => formatCents(row.original.basePrice, row.original.currency),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={PRODUCT_STATUS_BADGE_VARIANT[row.original.status]}>
            {PRODUCT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      { accessorKey: "variantCount", header: "Variants" },
      { accessorKey: "totalStock", header: "Stock" },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => formatUpdatedAt(row.original.updatedAt),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6">
      <AdminTitle title="Products" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} product${data.total === 1 ? "" : "s"}` : "Loading…"}
        </p>
        <CreateProductDialog />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-product-search">Search</Label>
          <Input
            id="admin-product-search"
            placeholder="Name or slug"
            className="w-full sm:w-56"
            defaultValue={filters.search}
            onBlur={(e) => setFilters({ search: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && setFilters({ search: e.currentTarget.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-product-type">Type</Label>
          <Select
            value={filters.type ?? ALL_TYPES}
            onValueChange={(value) => setFilters({ type: value && value !== ALL_TYPES ? (value as ProductType) : undefined })}
          >
            <SelectTrigger id="admin-product-type" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>All types</SelectItem>
              {ADMIN_FILTER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PRODUCT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-product-status">Status</Label>
          <Select
            value={filters.status ?? ALL_STATUSES}
            onValueChange={(value) =>
              setFilters({ status: value && value !== ALL_STATUSES ? (value as typeof filters.status) : undefined })
            }
          >
            <SelectTrigger id="admin-product-status" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              <SelectItem value="active">{PRODUCT_STATUS_LABELS.active}</SelectItem>
              <SelectItem value="draft">{PRODUCT_STATUS_LABELS.draft}</SelectItem>
              <SelectItem value="archived">{PRODUCT_STATUS_LABELS.archived}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError ? (
        <p className="rounded-xl border border-dashed border-destructive/40 p-6 text-center text-sm text-destructive">
          {error instanceof ApiRequestError ? error.message : "Couldn't load products right now."}
        </p>
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity duration-fast" : undefined}>
          <DataTable columns={columns} data={data?.products ?? []} isLoading={isPending} emptyMessage="No products match those filters." />
          {data && (
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(page) => setFilters({ page })} />
          )}
        </div>
      )}
    </div>
  )
}
