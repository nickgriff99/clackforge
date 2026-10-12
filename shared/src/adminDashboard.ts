import { z } from "zod"
import { CentsSchema, IsoDateTimeSchema } from "./common"
import { BuildSlotSchema } from "./build"

/**
 * Admin dashboard + reset-demo-data contract.
 *
 * `GET /api/admin/drops/:slug` needs NO new schema - it reuses
 * `AdminDropResponseSchema` from `./groupBuyDrop.ts` VERBATIM: `{ drop:
 * GroupBuyDropSchema }`, the identical shape the existing
 * `PATCH /api/admin/drops/:slug` route already returns (see
 * `server/src/routes/drops.ts`). Import `AdminDropResponseSchema` from
 * `groupBuyDrop.ts`, not from here - this file does not re-export it, to
 * avoid duplicating the shape.
 */

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/orders-summary
// ---------------------------------------------------------------------------

export const AdminOrdersOverTimePointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  orderCount: z.number().int().min(0),
  revenue: CentsSchema,
})
export type AdminOrdersOverTimePoint = z.infer<typeof AdminOrdersOverTimePointSchema>

/**
 * `GET /api/admin/dashboard/orders-summary` response (requireAuth +
 * requireAdmin, same gate convention as every other `/api/admin/*` route).
 *
 * `revenue`/`orderCount` are ALL-TIME `SUM(Order.total)` / `COUNT(Order.id)`
 * - NO status filter applied. This is deliberate, not an oversight: this
 * app's `OrderStatus` enum (`schema.prisma`) is `PLACED | BUILDING | SHIPPED
 * | DELIVERED` ONLY - there is no `CANCELLED` (or any other non-fulfilling)
 * state to exclude.
 * Every `Order` row that exists represents a real, paid, Stripe-webhook-
 * confirmed sale (see `order.ts`'s doc comment: rows are only created once
 * the webhook confirms payment) - there is no "this order doesn't count"
 * case in this data model, so summing unconditionally is correct, not a
 * shortcut.
 *
 * `ordersOverTime`, by contrast, is a FIXED 30-day window ending "now" at
 * request time, ZERO-FILLED for any day with no orders (always exactly 30
 * points, oldest first, one per calendar day) - a day-bucketed chart, not a
 * running total.
 *
 * EXPECTED IN THIS DEMO'S SEEDED DATA (not a bug to "fix" later): every
 * seeded sample order's `placedAt` falls inside the trailing 30-day window
 * by construction (see `seed.ts`'s `seedSampleOrdersAndBuilds` - the oldest
 * bucket is `daysAgo: 21`), so `revenue`/`orderCount` here will equal the
 * SUM/COUNT of `ordersOverTime`'s 30 points exactly, for as long as this demo
 * only contains seeded orders. The two numbers are only EXPECTED to diverge
 * once a real order's `placedAt` eventually ages past 30 days (all-time
 * keeps counting it, the windowed chart drops it off the left edge) - that
 * future divergence is correct behavior, don't "fix" revenue to also window
 * to 30 days if a reviewer notices the two matching today.
 */
export const AdminDashboardOrdersSummaryResponseSchema = z.object({
  revenue: CentsSchema,
  orderCount: z.number().int().min(0),
  windowDays: z.literal(30),
  ordersOverTime: z.array(AdminOrdersOverTimePointSchema),
})
export type AdminDashboardOrdersSummaryResponse = z.infer<typeof AdminDashboardOrdersSummaryResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard/top-options
// ---------------------------------------------------------------------------

export const AdminTopConfiguredOptionSchema = z.object({
  slot: BuildSlotSchema,
  optionId: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().min(1),
  buildsWithSlotSet: z.number().int().min(1),
})
export type AdminTopConfiguredOption = z.infer<typeof AdminTopConfiguredOptionSchema>

/**
 * `GET /api/admin/dashboard/top-options` response. `totalBuilds` is the
 * grand total `COUNT(CustomBuild.id)` across the whole table - informational
 * context only, NOT the percentage denominator for any individual row below.
 *
 * `buildsWithSlotSet` IS the real denominator for "how popular is this
 * option, among builders who actually made a choice for this slot" -
 * per-slot, not per-option (every option row sharing the same `slot` repeats
 * the same `buildsWithSlotSet` value). This matters because `artisanKeycap`
 * and `cable` are frequently left UNSET (see `build.ts`'s doc comment: both
 * are optional extras with no "none" option id, absent key = not selected).
 * Dividing an artisan-keycap option's `count` by `totalBuilds` would
 * understate it - e.g. if only 3 of 8 seeded builds set `artisanKeycap` at
 * all, the most-picked artisan option among THOSE 3 is still a genuinely
 * popular pick, not a `3/8`-looks-unpopular one. Compute each row's real
 * percentage client-side as `count / buildsWithSlotSet`, never
 * `count / totalBuilds`.
 */
export const AdminTopOptionsResponseSchema = z.object({
  totalBuilds: z.number().int().min(0),
  topOptionsBySlot: z.array(AdminTopConfiguredOptionSchema),
})
export type AdminTopOptionsResponse = z.infer<typeof AdminTopOptionsResponseSchema>

// ---------------------------------------------------------------------------
// POST /api/admin/reset-demo-data
// ---------------------------------------------------------------------------

/**
 * `POST /api/admin/reset-demo-data` response (requireAuth + requireAdmin).
 * `counts` mirrors `seedAll`'s real return value (`server/prisma/seed.ts`) -
 * REAL post-reseed row counts (`prisma.<model>.count()` for each of the five
 * entities below, read right after `seedAll` finishes), not hardcoded
 * numbers. `User` is deliberately absent from this shape - the wipe-then-
 * reseed never touches `User` rows (see `seedAll`'s doc comment), so there
 * is nothing meaningful to report there.
 */
export const AdminResetDemoDataResponseSchema = z.object({
  resetAt: IsoDateTimeSchema,
  counts: z.object({
    products: z.number().int().min(0),
    variants: z.number().int().min(0),
    orders: z.number().int().min(0),
    customBuilds: z.number().int().min(0),
    groupBuyDrops: z.number().int().min(0),
  }),
})
export type AdminResetDemoDataResponse = z.infer<typeof AdminResetDemoDataResponseSchema>

/**
 * Dashboard/reset-demo-data route contract - quick-reference index (same
 * inline-doc convention as `admin.ts`'s route index). All three routes
 * below require BOTH `requireAuth` AND `requireAdmin`, in that order (401
 * before 403), same gate as every other `/api/admin/*` route:
 *
 *   GET  /api/admin/dashboard/orders-summary  -> 200 AdminDashboardOrdersSummaryResponseSchema
 *   GET  /api/admin/dashboard/top-options     -> 200 AdminTopOptionsResponseSchema
 *   GET  /api/admin/drops/:slug               -> 200 AdminDropResponseSchema (groupBuyDrop.ts, reused verbatim) | 404 NOT_FOUND
 *   POST /api/admin/reset-demo-data           -> 200 AdminResetDemoDataResponseSchema
 *
 * Route placement: the existing admin surface lives inside
 * `productsRouter`/`ordersRouter`/`dropsRouter` - joining an existing
 * early-mounted router sidesteps `cart.ts`/`orders.ts`'s blanket-`requireAuth`
 * mount-order footgun entirely. None of these three
 * new routes are product/order/drop CRUD though - `dashboard/orders-summary`
 * and `dashboard/top-options` have no obvious existing-router home, and
 * `reset-demo-data` touches every table at once. Recommend a new
 * `server/src/routes/adminDashboard.ts` exporting `adminDashboardRouter`,
 * mounted in `app.ts` anywhere alongside `productsRouter` (early, before
 * `cartRouter`/`ordersRouter`, same safety reasoning) - but the admin
 * `GET /api/admin/drops/:slug` route belongs in the EXISTING
 * `server/src/routes/drops.ts` file instead (sits right next to the
 * existing `PATCH /api/admin/drops/:slug`, same file, same router,
 * `dropsRouter` is already mounted early) - don't split one resource's
 * admin routes across two files.
 */
