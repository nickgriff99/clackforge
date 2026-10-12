import { Link } from "react-router-dom"
import { PackageSearch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiRequestError } from "@/lib/api"
import { formatCents } from "@/lib/utils"
import { ORDER_STATUS_BADGE_VARIANT, ORDER_STATUS_LABELS } from "@/features/orders/constants"
import { useOrders } from "@/features/orders/queries"

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

/** `GET /api/orders` - real list, no stub. Used by `Account.tsx`. */
export function OrderHistoryList() {
  const { data, isPending, isError, error } = useOrders()

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiRequestError ? error.message : "Couldn't load your orders right now."}
      </p>
    )
  }

  if (data.orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
        <PackageSearch className="size-7 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No orders yet. They'll show up here once you check out.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {data.orders.map((order) => (
        <Link
          key={order.id}
          to={`/account/orders/${order.id}`}
          className="flex items-center justify-between gap-4 p-4 transition-colors duration-fast ease-standard hover:bg-muted"
        >
          <div className="flex flex-col gap-1">
            <span className="font-specs text-sm">#{order.orderNumber}</span>
            <span className="text-xs text-muted-foreground">
              {formatPlacedAt(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
            <span className="font-specs text-sm">{formatCents(order.total, order.currency)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
