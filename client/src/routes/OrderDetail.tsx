import { Link, useParams } from "react-router-dom"
import { Seo } from "@/components/seo/Seo"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ORDER_STATUS_BADGE_VARIANT, ORDER_STATUS_LABELS } from "@/features/orders/constants"
import { useOrder } from "@/features/orders/queries"
import { ApiRequestError } from "@/lib/api"
import { ProtectedRoute } from "@/lib/auth"
import { formatCents } from "@/lib/utils"

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

function OrderDetailContent() {
  const { id } = useParams<{ id: string }>()
  const { data, isPending, isError, error } = useOrder(id)

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const notFound = isError && error instanceof ApiRequestError && error.status === 404

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link to="/account" className="text-sm text-accent underline underline-offset-2">
          ← Back to account
        </Link>
        <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-8">
          <h1 className="font-heading text-2xl">{notFound ? "Order not found" : "Couldn't load this order"}</h1>
          <p className="text-sm text-muted-foreground">
            {notFound
              ? "This order doesn't exist, or isn't tied to your account."
              : error instanceof ApiRequestError
                ? error.message
                : "Something went wrong talking to the server."}
          </p>
        </div>
      </div>
    )
  }

  const { order } = data

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link to="/account" className="text-sm text-accent underline underline-offset-2">
        ← Back to account
      </Link>

      <div className="mt-6 flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl">Order #{order.orderNumber}</h1>
          <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Placed {formatPlacedAt(order.placedAt)}</p>
      </div>

      <div className="mt-6 flex flex-col divide-y divide-border rounded-xl border border-border">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm">{item.name}</span>
              <span className="font-specs text-xs text-muted-foreground">
                {formatCents(item.unitPrice, order.currency)} × {item.quantity}
              </span>
            </div>
            <span className="font-specs text-sm">{formatCents(item.lineTotal, order.currency)}</span>
          </div>
        ))}
      </div>

      <dl className="font-specs mt-6 flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{formatCents(order.subtotal, order.currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd>{order.shipping === 0 ? "Free" : formatCents(order.shipping, order.currency)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Tax</dt>
          <dd>{formatCents(order.tax, order.currency)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-medium">
          <dt>Total</dt>
          <dd>{formatCents(order.total, order.currency)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function OrderDetail() {
  return (
    <ProtectedRoute>
      <Seo title="Order details" description="View the status and line items for your CLACKFORGE order." />
      <OrderDetailContent />
    </ProtectedRoute>
  )
}
