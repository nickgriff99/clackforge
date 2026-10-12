import { calculateCartTotals, FREE_SHIPPING_THRESHOLD_CENTS, type CartItemSnapshot } from "@shared"
import { Progress } from "@/components/ui/progress"
import { formatCents } from "@/lib/utils"

export function CartSummary({ items }: { items: CartItemSnapshot[] }) {
  const totals = calculateCartTotals(items)
  const grandTotal = totals.subtotal + totals.estimatedShipping + totals.estimatedTax
  // FREE_SHIPPING_THRESHOLD_CENTS is imported, not re-hardcoded, purely so
  // the progress bar has a denominator - the dollar figures themselves all
  // come straight off `calculateCartTotals`'s return value.
  const progressPct = Math.min(100, (totals.subtotal / FREE_SHIPPING_THRESHOLD_CENTS) * 100)

  return (
    <div className="flex flex-col gap-3">
      {totals.freeShippingRemaining > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            Add {formatCents(totals.freeShippingRemaining)} more for free shipping.
          </p>
          <Progress value={progressPct} aria-label="Progress toward free shipping" />
        </div>
      ) : (
        <p className="text-xs text-accent">Free shipping unlocked.</p>
      )}

      <dl className="font-specs flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatCents(totals.subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Shipping (est.)</dt>
          <dd>{totals.estimatedShipping === 0 ? "Free" : formatCents(totals.estimatedShipping)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Tax (est.)</dt>
          <dd>{formatCents(totals.estimatedTax)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-medium">
          <dt>Total</dt>
          <dd>{formatCents(grandTotal)}</dd>
        </div>
      </dl>
    </div>
  )
}
