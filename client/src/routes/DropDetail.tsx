import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Clock, PackageX, Timer } from "lucide-react"
import type { DropStateResponse, ReserveDropResponse } from "@shared"
import { ProductVisual } from "@/components/catalog/ProductVisual"
import { Seo } from "@/components/seo/Seo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCountdown, useCountdown } from "@/features/drops/countdown"
import { useDropState, useReleaseDropReservationMutation, useReserveDropMutation } from "@/features/drops/queries"
import { useAuth } from "@/lib/auth"
import { ApiRequestError } from "@/lib/api"
import { formatCents } from "@/lib/utils"

type HeldReservation = ReserveDropResponse["reservation"]

/**
 * Reads `GET /api/drops/:slug` via `useDropState` (3s poll - see that
 * hook's doc comment for why this is the "realtime across browsers"
 * mechanism instead of a WebSocket). Renders the four computed
 * `DropStatus` values distinctly: pending -> skeleton, error -> message,
 * then branch on the loaded data's own state.
 *
 * `heldReservation` is local component state, not server state - the
 * public `GET /api/drops/:slug` response deliberately carries no per-user
 * "does the current visitor hold a reservation" field, since it's the same
 * public shape for every visitor. The only place this client learns about
 * its own reservation is the `POST .../reserve` response body, so that's
 * held here and cleared when its countdown hits zero or the user cancels
 * it.
 */
function CountdownBlock({ label, targetIso, serverNowIso }: { label: string; targetIso: string; serverNowIso: string }) {
  const remainingMs = useCountdown(targetIso, serverNowIso)
  return (
    <p className="flex items-center gap-2 font-specs text-sm text-muted-foreground">
      <Clock className="size-4" />
      {label} <span className="text-foreground">{formatCountdown(remainingMs)}</span>
    </p>
  )
}

function HeldReservationPanel({
  slug,
  reservation,
  serverNowIso,
  onReleased,
}: {
  slug: string
  reservation: HeldReservation
  serverNowIso: string
  onReleased: () => void
}) {
  const remainingMs = useCountdown(reservation.expiresAt, serverNowIso)
  const releaseMutation = useReleaseDropReservationMutation(slug)

  useEffect(() => {
    if (remainingMs <= 0) onReleased()
    // onReleased is a stable setter from the parent - only re-fire off the countdown reaching zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs])

  async function handleCancel() {
    try {
      await releaseMutation.mutateAsync()
      toast.info("Reservation released", { description: "Those units are back in the pool for everyone." })
      onReleased()
    } catch (err) {
      toast.error("Couldn't release your reservation", {
        description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
      })
    }
  }

  if (remainingMs <= 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Timer className="size-4 text-primary" />
        Holding {reservation.quantity} unit{reservation.quantity === 1 ? "" : "s"} for{" "}
        <span className="font-specs text-primary">{formatCountdown(remainingMs)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Finish checkout before the timer runs out, or this hold releases back to the pool automatically.
      </p>
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={handleCancel} disabled={releaseMutation.isPending}>
        {releaseMutation.isPending ? "Releasing…" : "Release this hold"}
      </Button>
    </div>
  )
}

function DropStateBadge({ status }: { status: DropStateResponse["status"] }) {
  const map: Record<DropStateResponse["status"], { label: string; variant: "default" | "secondary" | "outline" }> = {
    upcoming: { label: "Opens soon", variant: "outline" },
    live: { label: "Live now", variant: "default" },
    sold_out: { label: "Sold out", variant: "secondary" },
    closed: { label: "Closed", variant: "secondary" },
  }
  const { label, variant } = map[status]
  return <Badge variant={variant}>{label}</Badge>
}

function DropDetailContent({ slug }: { slug: string }) {
  const { data, isPending, isError, error } = useDropState(slug)
  const { isAuthenticated } = useAuth()
  const reserveMutation = useReserveDropMutation(slug)
  const [quantity, setQuantity] = useState(1)
  const [heldReservation, setHeldReservation] = useState<HeldReservation | null>(null)

  if (isPending) {
    return (
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12 sm:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.status === 404
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/shop" className="text-sm text-accent underline underline-offset-2">
          ← Back to shop
        </Link>
        <div className="mt-6 flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-8">
          <h1 className="font-heading text-2xl">{notFound ? "Drop not found" : "Couldn't load this drop"}</h1>
          <p className="text-sm text-muted-foreground">
            {error instanceof ApiRequestError ? error.message : "Something went wrong talking to the server."}
          </p>
        </div>
      </div>
    )
  }

  const unitPrice = data.product.basePrice + data.variant.priceDelta
  const maxQuantity = Math.max(1, Math.min(data.availableStock, 10))
  const percentRemaining = data.totalStock === 0 ? 0 : Math.round((data.availableStock / data.totalStock) * 100)

  async function handleReserve() {
    try {
      const result = await reserveMutation.mutateAsync({ quantity })
      setHeldReservation(result.reservation)
      toast.success("Reserved", {
        description: `${result.reservation.quantity} unit${result.reservation.quantity === 1 ? "" : "s"} held in your cart. Check out before the timer runs out.`,
      })
      setQuantity(1)
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "SOLD_OUT") {
        toast.error("Sold out", { description: "Someone else just took the last of these. Sorry!" })
      } else if (err instanceof ApiRequestError && err.code === "DROP_NOT_LIVE") {
        toast.error("Not live", { description: "This drop isn't open for reservations right now." })
      } else {
        toast.error("Couldn't reserve", {
          description: err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server.",
        })
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Seo title={data.title} description={data.description} type="product" />
      <Link to="/shop" className="text-sm text-accent underline underline-offset-2">
        ← Back to shop
      </Link>

      <header className="mt-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Group buy drop</Badge>
          <DropStateBadge status={data.status} />
        </div>
        <h1 className="font-heading text-3xl">{data.title}</h1>
        <p className="text-sm text-muted-foreground">{data.description}</p>
      </header>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-card">
            <ProductVisual
              slug={data.product.slug}
              category={data.product.category}
              specs={data.product.specs}
              label={`${data.product.name} (${data.variant.name})`}
              className="h-full w-full"
            />
          </div>
          <p className="font-specs text-xs text-muted-foreground">
            {data.product.name} ({data.variant.name})
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <p className="font-specs text-xl">{formatCents(unitPrice, data.product.currency)}</p>

          {data.status === "upcoming" && (
            <CountdownBlock label="Opens in" targetIso={data.openAt} serverNowIso={data.serverNow} />
          )}
          {data.status === "live" && (
            <CountdownBlock label="Closes in" targetIso={data.closeAt} serverNowIso={data.serverNow} />
          )}
          {data.status === "closed" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" /> This drop has closed.
            </p>
          )}
          {data.status === "sold_out" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PackageX className="size-4" /> Every unit in this run was claimed.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Progress value={percentRemaining} aria-label="Stock remaining" />
            <p className="font-specs text-xs text-muted-foreground">
              {data.availableStock} of {data.totalStock} units left
            </p>
          </div>

          {heldReservation && (
            <HeldReservationPanel
              slug={slug}
              reservation={heldReservation}
              serverNowIso={data.serverNow}
              onReleased={() => setHeldReservation(null)}
            />
          )}

          {data.status === "live" && !heldReservation && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              {isAuthenticated ? (
                <>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="drop-quantity" className="sr-only">
                      Quantity
                    </Label>
                    <Input
                      id="drop-quantity"
                      type="number"
                      min={1}
                      max={maxQuantity}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, Number(e.target.value) || 1)))}
                      className="w-20"
                    />
                    <Button
                      type="button"
                      className="flex-1"
                      disabled={reserveMutation.isPending || data.availableStock <= 0}
                      onClick={handleReserve}
                    >
                      {reserveMutation.isPending ? "Reserving…" : "Reserve"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Holds your units for 10 minutes while you check out.</p>
                </>
              ) : (
                <Button render={<Link to="/login" state={{ from: { pathname: `/drop/${slug}` } }} />}>
                  Sign in to reserve
                </Button>
              )}
            </div>
          )}

          <dl className="font-specs divide-y divide-border rounded-xl border border-border text-sm">
            {Object.entries(data.product.specs).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 px-4 py-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

export function DropDetail() {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) return null
  return <DropDetailContent slug={slug} />
}
