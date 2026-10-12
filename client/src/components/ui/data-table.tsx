import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/**
 * Server-side-pagination-only composition over `@tanstack/react-table`.
 * Scope deliberately narrow: no interactive column-header sort wiring
 * (`getSortedRowModel`/sort state) - sort stays a fixed query param, same
 * convention as the existing Shop page's `ProductFilters`. Pagination
 * controls live in the caller (reuse `features/catalog/Pagination.tsx`) -
 * this component only ever renders the one page of `data` it's handed, it
 * never slices/sorts client-side.
 *
 * `isLoading` renders skeleton rows at the final table's exact row/column
 * geometry rather than a generic spinner, to avoid layout shift.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  skeletonRowCount = 8,
  emptyMessage = "No results.",
}: {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  skeletonRowCount?: number
  emptyMessage?: string
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="rounded-xl border border-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
              <TableRow key={`skeleton-row-${rowIndex}`}>
                {columns.map((_, colIndex) => (
                  <TableCell key={`skeleton-cell-${colIndex}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
