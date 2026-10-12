import { useEffect, useState } from "react"
import type { Variant } from "@shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCents } from "@/lib/utils"
import { CreateVariantDialog } from "@/features/admin/CreateVariantDialog"
import { useDeleteAdminVariantMutation, useUpdateVariantStockMutation } from "@/features/admin/queries"

/**
 * Inline on-blur stock editor - the one spec-mandated interactive piece of
 * this screen (brief: a plain `<input type="number" aria-label="Stock for
 * {variant.name}">` per row, optimistic + rollback-on-error). Local string
 * state mirrors the field so typing doesn't fire a mutation per keystroke;
 * re-syncs from the server value whenever it changes out from under this
 * input (e.g. a rollback after a failed write, or another admin's
 * concurrent edit landing via a background refetch).
 */
function VariantStockInput({ productId, variant }: { productId: string; variant: Variant }) {
  const [value, setValue] = useState(String(variant.stock))
  const mutation = useUpdateVariantStockMutation(productId)

  useEffect(() => {
    setValue(String(variant.stock))
  }, [variant.stock])

  function commit() {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      setValue(String(variant.stock))
      return
    }
    if (parsed === variant.stock) return
    mutation.mutate({ variantId: variant.id, stock: parsed })
  }

  return (
    <Input
      type="number"
      min={0}
      step="1"
      className="w-20"
      aria-label={`Stock for ${variant.name}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  )
}

export function VariantsTable({ productId, variants }: { productId: string; variants: Variant[] }) {
  const deleteMutation = useDeleteAdminVariantMutation(productId)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg">Variants</h2>
        <CreateVariantDialog productId={productId} />
      </div>

      {variants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No variants yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price delta</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell>{variant.name}</TableCell>
                <TableCell className="font-specs text-xs text-muted-foreground">{variant.sku}</TableCell>
                <TableCell>{formatCents(variant.priceDelta)}</TableCell>
                <TableCell>
                  <VariantStockInput productId={productId} variant={variant} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={variant.stock === 0 || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(variant.id)}
                  >
                    {variant.stock === 0 ? "Stock cleared" : "Clear stock"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
