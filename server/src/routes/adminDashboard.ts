import {
  AdminDashboardOrdersSummaryResponseSchema,
  AdminResetDemoDataResponseSchema,
  AdminTopOptionsResponseSchema,
  BuildSlotSchema,
  getOptionById,
  type AdminOrdersOverTimePoint,
  type AdminTopConfiguredOption,
  type BuildSlot,
} from "@shared"
import { Router } from "express"
import { prisma } from "../db/prisma"
import { requireAdmin } from "../middleware/requireAdmin"
import { requireAuth } from "../middleware/requireAuth"
import { seedAll } from "../../prisma/seed"

/**
 * Admin dashboard (orders summary / top-configured-options) +
 * reset-demo-data. This is a separate router rather than joining
 * `productsRouter`/`ordersRouter` because none of these three routes are
 * product/order CRUD, and `reset-demo-data` touches every table at once -
 * splitting would've meant inventing a home in an unrelated file for no
 * benefit. `GET /api/admin/drops/:slug` lives in `routes/drops.ts` instead,
 * next to the existing `PATCH /api/admin/drops/:slug`.
 *
 * Mount order: these three routes aren't public, but `app.ts` mounts this
 * router early anyway (alongside `productsRouter`) for consistency with
 * every other `/api/admin/*` surface, not because it's strictly required
 * (every route here already carries its own `requireAuth, requireAdmin`
 * pair).
 */
export const adminDashboardRouter = Router()

const UTC_DAY_MS = 24 * 60 * 60 * 1000
const DASHBOARD_WINDOW_DAYS = 30

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// GET /api/admin/dashboard/orders-summary - requireAuth + requireAdmin.
// All-time revenue/orderCount via a single aggregate; ordersOverTime is a
// separate, explicitly zero-filled 30-day bucket pass - see
// AdminDashboardOrdersSummaryResponseSchema's doc comment (shared/src/
// adminDashboard.ts) for why these two are allowed to diverge over time and
// why that's correct, not a bug.
adminDashboardRouter.get(
  "/api/admin/dashboard/orders-summary",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const totals = await prisma.order.aggregate({
        _sum: { total: true },
        _count: true,
      })

      // Oldest-first list of the 30 UTC calendar-day keys in the window,
      // built from "today" (UTC) backwards - independent of what orders
      // actually exist, so every day gets a bucket even with zero orders.
      const now = new Date()
      const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const dayKeys: string[] = []
      for (let i = DASHBOARD_WINDOW_DAYS - 1; i >= 0; i--) {
        dayKeys.push(utcDateKey(new Date(todayUtcMidnight.getTime() - i * UTC_DAY_MS)))
      }
      const windowStart = new Date(todayUtcMidnight.getTime() - (DASHBOARD_WINDOW_DAYS - 1) * UTC_DAY_MS)

      const ordersInWindow = await prisma.order.findMany({
        where: { placedAt: { gte: windowStart } },
        select: { placedAt: true, total: true },
      })

      const buckets = new Map<string, { orderCount: number; revenue: number }>()
      for (const key of dayKeys) buckets.set(key, { orderCount: 0, revenue: 0 })
      for (const order of ordersInWindow) {
        const key = utcDateKey(order.placedAt)
        const bucket = buckets.get(key)
        // An order that falls outside the 30-key window (clock skew at the
        // exact boundary) is simply dropped from the chart, not crashed on -
        // the all-time revenue/orderCount above still counts it correctly.
        if (!bucket) continue
        bucket.orderCount += 1
        bucket.revenue += order.total
      }

      const ordersOverTime: AdminOrdersOverTimePoint[] = dayKeys.map((date) => {
        const bucket = buckets.get(date)!
        return { date, orderCount: bucket.orderCount, revenue: bucket.revenue }
      })

      res.status(200).json(
        AdminDashboardOrdersSummaryResponseSchema.parse({
          revenue: totals._sum.total ?? 0,
          orderCount: totals._count,
          windowDays: DASHBOARD_WINDOW_DAYS,
          ordersOverTime,
        }),
      )
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/admin/dashboard/top-options - requireAuth + requireAdmin. Plain-JS
// aggregation over every CustomBuild's `selections` (a Partial<Record<
// BuildSlot, optionId>> JSON blob, shared/src/build.ts) - no SQL JSON
// aggregation needed at this data volume (a demo's seeded CustomBuild table).
adminDashboardRouter.get(
  "/api/admin/dashboard/top-options",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const builds = await prisma.customBuild.findMany({ select: { selections: true } })
      const totalBuilds = builds.length

      const topOptionsBySlot: AdminTopConfiguredOption[] = []

      for (const slot of BuildSlotSchema.options) {
        const countsByOptionId = new Map<string, number>()
        let buildsWithSlotSet = 0

        for (const build of builds) {
          // `selections` is a Prisma Json column this app only ever writes
          // as Partial<Record<BuildSlot, string>> (see build.ts's doc
          // comment + prisma/seed.ts's CUSTOM_BUILD_DEFS) - same narrowing
          // cast as products.ts's asStringRecord, not a runtime assertion.
          const selections = build.selections as Partial<Record<BuildSlot, string>>
          const optionId = selections[slot]
          if (!optionId) continue
          buildsWithSlotSet += 1
          countsByOptionId.set(optionId, (countsByOptionId.get(optionId) ?? 0) + 1)
        }

        // Omit the slot entirely if zero builds ever set it - per
        // AdminTopOptionsResponseSchema's doc comment, don't synthesize a
        // fake zero-entry (also structurally required: the schema's `count`/
        // `buildsWithSlotSet` are both `.min(1)`).
        if (buildsWithSlotSet === 0) continue

        let bestOptionId: string | undefined
        let bestCount = 0
        for (const [optionId, count] of countsByOptionId) {
          if (count > bestCount) {
            bestCount = count
            bestOptionId = optionId
          }
        }
        if (!bestOptionId) continue

        const option = getOptionById(bestOptionId)
        topOptionsBySlot.push({
          slot,
          optionId: bestOptionId,
          // Never send a raw option id as the label - resolve the real
          // catalog label. Falls back to the id itself only if a build
          // somehow references an option id no longer in the catalog (would
          // indicate a real data-integrity bug elsewhere, not expected to
          // ever hit in this demo's seeded data).
          label: option?.label ?? bestOptionId,
          count: bestCount,
          buildsWithSlotSet,
        })
      }

      res.status(200).json(AdminTopOptionsResponseSchema.parse({ totalBuilds, topOptionsBySlot }))
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/admin/reset-demo-data - requireAuth + requireAdmin, no body.
// `seedAll` (server/prisma/seed.ts) owns the real work (wipe every table
// except User, reseed catalog/drop/admin-user/sample-orders-and-builds,
// return real post-reseed counts) - this route is purely a thin wire-up.
adminDashboardRouter.post(
  "/api/admin/reset-demo-data",
  requireAuth,
  requireAdmin,
  async (_req, res, next) => {
    try {
      const counts = await seedAll(prisma)
      res.status(200).json(
        AdminResetDemoDataResponseSchema.parse({
          resetAt: new Date().toISOString(),
          counts,
        }),
      )
    } catch (err) {
      next(err)
    }
  },
)
