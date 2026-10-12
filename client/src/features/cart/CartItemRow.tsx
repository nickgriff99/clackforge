import { Minus, Plus, Timer, Trash2 } from "lucide-react"
import type { CartItemSnapshot } from "@shared"
import { Button } from "@/components/ui/button"
import { formatCountdown, useCountdown } from "@/features/drops/countdown"
import { formatCents } from "@/lib/utils"

/**
 * Group-buy-hold countdown + label for a `dropReservation`-backed line -
 * reuses `useCountdown`/`formatCountdown` exactly like `DropDetail.tsx`'s own
 * `HeldReservationPanel`/`CountdownBlock` (same clock-skew-corrected pattern,
 * baselined off the cart snapshot's own `serverNow`, never local `Date.now()`).
 */
function DropHoldLabel({ expiresAt, serverNow }: { expiresAt: string; serverNow: string }) {
  const remainingMs = useCountdown(expiresAt, serverNow)
  return (
    <span className="flex items-center gap-1 font-specs text-xs text-primary">
      <Timer className="size-3" />
      Group-buy hold: expires in {formatCountdown(remainingMs)}
    </span>
  )
}

export function CartItemRow({
  item,
  serverNow,
  onUpdateQuantity,
  onRemove,
}: {
  item: CartItemSnapshot
  /** Clock-skew baseline from `CartSnapshot.serverNow` - required when `item.dropReservation` is set. */
  serverNow: string
  onUpdateQuantity: (quantity: number) => void
  onRemove: () => void
}) {
  const isDropLocked = Boolean(item.dropReservation)

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="font-heading text-sm">{item.name}</span>
        <span className="font-specs text-xs text-muted-foreground">
          {formatCents(item.unitPrice)} each
        </span>
        {item.dropReservation && <DropHoldLabel expiresAt={item.dropReservation.expiresAt} serverNow={serverNow} />}
        <div className="mt-1 flex items-center rounded-lg border border-input">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Decrease quantity of ${item.name}`}
            disabled={isDropLocked || item.quantity <= 1}
            onClick={() => onUpdateQuantity(item.quantity - 1)}
          >
            <Minus />
          </Button>
          <span className="font-specs w-6 text-center text-xs" aria-live="polite">
            {item.quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Increase quantity of ${item.name}`}
            disabled={isDropLocked}
            onClick={() => onUpdateQuantity(item.quantity + 1)}
          >
            <Plus />
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <span className="font-specs text-sm">{formatCents(item.lineTotal)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${item.name} from cart`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
