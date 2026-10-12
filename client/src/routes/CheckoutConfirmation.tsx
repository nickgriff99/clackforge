import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CircleCheck, PackageSearch } from "lucide-react"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProtectedRoute } from "@/lib/auth"
import { formatCents } from "@/lib/utils"
import { ORDER_STATUS_LABELS } from "@/features/orders/constants"
import { useOrder, useOrders } from "@/features/orders/queries"

/**
 * Known gap: Stripe's `success_url` is
 * `/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}` - a Stripe
 * checkout session id, not one of this app's own order ids. There's no
 * `GET /api/orders/by-session/:sessionId` route (only `GET /api/orders`
 * and `GET /api/orders/:id`, both keyed by our own order id), so this page
 * can't look its order up directly. Worked around here by polling
 * `GET /api/orders` (newest-first) for an order placed within a recency
 * window of landing on this page - a reasonable heuristic for a
 * single-user demo, not a real session-to-order lookup. A proper fix would
 * add that lookup route, or have the webhook/checkout-session route hand
 * back the order id some other way (e.g. stash it in Stripe session
 * metadata and expose a thin endpoint).
 */
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 6
const RECENCY_WINDOW_MS = 10 * 60 * 1000 // 10 minutes - generous skew allowance, not a security boundary

function CheckoutConfirmationContent() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get("session_id")
  const enteredAtRef = useRef(Date.now())
  const [pollCount, setPollCount] = useState(0)

  const ordersQuery = useOrders()

  const candidateSummary = ordersQuery.data?.orders.find(
    (order) => enteredAtRef.current - new Date(order.placedAt).getTime() < RECENCY_WINDOW_MS,
  )

  const stillPolling = Boolean(sessionId) && ordersQuery.isSuccess && !candidateSummary && pollCount < MAX_POLLS

  useEffect(() => {
    if (!stillPolling) return
    const timer = setTimeout(() => {
      setPollCount((n) => n + 1)
      void ordersQuery.refetch()
    }, POLL_INTERVAL_MS)
    return () => clearTimeout(timer)
    // ordersQuery itself is excluded - only re-arm the timer off stillPolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillPolling])

  const orderDetailQuery = useOrder(candidateSummary?.id)

  // No session_id at all - not a valid confirmation deep-link (direct nav,
  // bookmarked, or the cancel_url case never redirects here). Don't poll.
  if (!sessionId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <PackageSearch className="size-10 text-muted-foreground" />
        <h1 className="font-heading text-2xl">No confirmation to show</h1>
        <p className="text-sm text-muted-foreground">
          This page confirms an order right after Stripe checkout. Looking for a past order?
        </p>
        <Button render={<Link to="/account" />}>Go to your orders</Button>
      </div>
    )
  }

  // `orderDetailQuery` is disabled (and so permanently "isPending") until a
  // candidate order id exists - only count it as a loading blocker once it's
  // actually enabled, or the "still processing" fallback below would never
  // be reachable once polling gives up with no candidate found.
  const isLoadingOrderDetail = Boolean(candidateSummary) && orderDetailQuery.isPending

  if (ordersQuery.isPending || isLoadingOrderDetail || (stillPolling && !candidateSummary)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <Skeleton className="size-10 rounded-full" />
          <p className="font-heading text-lg">Finalizing your order…</p>
          <p className="text-sm text-muted-foreground">This only takes a moment.</p>
        </div>
      </div>
    )
  }

  const order = orderDetailQuery.data?.order

  if (!order) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <PackageSearch className="size-10 text-muted-foreground" />
        <h1 className="font-heading text-2xl">Still processing</h1>
        <p className="text-sm text-muted-foreground">
          Your payment went through, but the order hasn't shown up here yet. It'll appear in your order
          history shortly. This can lag a few seconds behind checkout.
        </p>
        <Button render={<Link to="/account" />}>Check your orders</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Seo
        title={`Order #${order.orderNumber} confirmed`}
        description="Your CLACKFORGE order is confirmed. Review the items and total below."
      />
      <div className="flex flex-col items-center gap-2 text-center">
        <CircleCheck className="size-10 text-accent" />
        <h1 className="font-heading text-3xl">Order confirmed</h1>
        <p className="font-specs text-sm text-muted-foreground">
          Order <span className="text-foreground">#{order.orderNumber}</span> ·{" "}
          {ORDER_STATUS_LABELS[order.status]}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
            </span>
            <span className="font-specs">{formatCents(item.lineTotal, order.currency)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-border pt-3 text-base font-medium">
          <span>Total</span>
          <span className="font-specs">{formatCents(order.total, order.currency)}</span>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button render={<Link to={`/account/orders/${order.id}`} />}>View order details</Button>
        <Button variant="ghost" render={<Link to="/shop" />}>
          Continue shopping
        </Button>
      </div>
    </div>
  )
}

export function CheckoutConfirmation() {
  return (
    <ProtectedRoute>
      <CheckoutConfirmationContent />
    </ProtectedRoute>
  )
}
