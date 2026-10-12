import type { AdminOrdersOverTimePoint } from "@shared"
import { AdminTitle } from "@/components/seo/AdminTitle"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SLOT_META } from "@/features/configurator/slotLabels"
import { useAdminDashboardOrdersSummary, useAdminDashboardTopOptions, useResetDemoDataMutation } from "@/features/admin/queries"
import { ApiRequestError } from "@/lib/api"
import { formatCents } from "@/lib/utils"

/**
 * Two independently-fetching widgets, each with its own loading/error/empty
 * state (same resilience pattern as `Account.tsx`'s `OrderHistoryList`/
 * `SavedBuildsList`, each a separate `useQuery`) - one widget failing never
 * blanks the other.
 */

const CHART_WIDTH = 600
const CHART_HEIGHT = 160
const CHART_PAD_BOTTOM = 20
const CHART_BAR_GAP = 2

/**
 * Hand-rolled SVG bar chart - no new charting library, same approach as
 * `ForceCurveChart.tsx`. A real, visible `<table>` of the same points is
 * included below it inside a native `<details>` (collapsed by default - 30
 * rows is too dense to show inline, but it's real content, not `sr-only`,
 * visible to everyone and not just a screen reader).
 */
function OrdersOverTimeChart({ points }: { points: AdminOrdersOverTimePoint[] }) {
  if (points.length === 0) return <p className="text-sm text-muted-foreground">No data yet.</p>

  const maxRevenue = Math.max(1, ...points.map((p) => p.revenue))
  const barWidth = CHART_WIDTH / points.length - CHART_BAR_GAP
  const plotHeight = CHART_HEIGHT - CHART_PAD_BOTTOM

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`Daily revenue for the last ${points.length} days, from ${points[0]!.date} to ${points[points.length - 1]!.date}. The full breakdown is also available in the table below the chart.`}
        className="w-full"
      >
        {points.map((p, i) => {
          const barHeight = Math.max(1, (p.revenue / maxRevenue) * plotHeight)
          const x = i * (barWidth + CHART_BAR_GAP)
          const y = plotHeight - barHeight
          return (
            <rect key={p.date} x={x} y={y} width={barWidth} height={barHeight} fill="var(--color-primary)" rx={1}>
              <title>{`${p.date}: ${p.orderCount} order${p.orderCount === 1 ? "" : "s"}, ${formatCents(p.revenue)}`}</title>
            </rect>
          )
        })}
        <line x1={0} y1={plotHeight} x2={CHART_WIDTH} y2={plotHeight} stroke="var(--color-border)" strokeWidth={1} />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{points[0]!.date}</span>
        <span>{points[points.length - 1]!.date}</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Show daily breakdown</summary>
        <table className="font-specs mt-2 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1 pr-4 font-normal">
                Date
              </th>
              <th scope="col" className="py-1 pr-4 font-normal">
                Orders
              </th>
              <th scope="col" className="py-1 font-normal">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-b border-border/50">
                <td className="py-1 pr-4">{p.date}</td>
                <td className="py-1 pr-4">{p.orderCount}</td>
                <td className="py-1">{formatCents(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

function WidgetError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="rounded-xl border border-dashed border-destructive/40 bg-card p-6 text-center text-sm text-destructive">
      {error instanceof ApiRequestError ? error.message : fallback}
    </div>
  )
}

function OrdersSummaryWidget() {
  const { data, isPending, isError, error } = useAdminDashboardOrdersSummary()

  if (isPending) return <WidgetSkeleton />
  if (isError) return <WidgetError error={error} fallback="Couldn't load the orders summary right now." />

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-lg">Orders</h2>
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs text-muted-foreground">All-time revenue</p>
          <p className="font-heading text-2xl">{formatCents(data.revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">All-time orders</p>
          <p className="font-heading text-2xl">{data.orderCount}</p>
        </div>
      </div>
      <OrdersOverTimeChart points={data.ordersOverTime} />
    </div>
  )
}

function TopOptionsWidget() {
  const { data, isPending, isError, error } = useAdminDashboardTopOptions()

  if (isPending) return <WidgetSkeleton />
  if (isError) return <WidgetError error={error} fallback="Couldn't load the top configured options right now." />

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-lg">Most configured options</h2>
      <p className="text-xs text-muted-foreground">
        {data.totalBuilds} custom build{data.totalBuilds === 1 ? "" : "s"} total
      </p>

      {data.topOptionsBySlot.length === 0 ? (
        <p className="text-sm text-muted-foreground">No configurator builds yet.</p>
      ) : (
        <table className="font-specs w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-4 font-normal">
                Slot
              </th>
              <th scope="col" className="py-1.5 pr-4 font-normal">
                Most popular
              </th>
              <th scope="col" className="py-1.5 font-normal">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {data.topOptionsBySlot.map((row) => (
              <tr key={row.slot} className="border-b border-border/50">
                <td className="py-1.5 pr-4 text-muted-foreground">{SLOT_META[row.slot].label}</td>
                <td className="py-1.5 pr-4">{row.label}</td>
                {/* Percentage is count / buildsWithSlotSet, never count / totalBuilds -
                    buildsWithSlotSet is the real denominator for "how popular among builders
                    who actually chose something for this slot," since optional slots like
                    cable/artisanKeycap are frequently left unset entirely. */}
                <td className="py-1.5">
                  {row.count}/{row.buildsWithSlotSet} ({Math.round((row.count / row.buildsWithSlotSet) * 100)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Destructive-styled, confirm-gated reset. `AlertDialogAction`'s `onClick`
 * fires the mutation and the dialog closes immediately after (it's a
 * `Close` primitive under the hood) - the mutation's own toast is the
 * feedback mechanism from that point on, not an in-dialog spinner. Every
 * admin query cache invalidation lives in `useResetDemoDataMutation`
 * itself, not duplicated here.
 */
function ResetDemoDataButton() {
  const mutation = useResetDemoDataMutation()

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>Reset demo data</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            This wipes every order, custom build, and the group buy drop back to their original seeded
            state, and resets the product/variant catalog too. Your own admin login is not affected:
            you'll still be signed in as the same admin user afterward.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            Reset demo data
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function AdminDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <AdminTitle title="Dashboard" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">A quick read on real seeded demo activity, not a live production store.</p>
        <ResetDemoDataButton />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <OrdersSummaryWidget />
        <TopOptionsWidget />
      </div>
    </div>
  )
}
