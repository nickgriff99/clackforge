import {
  AdminOrderDetailResponseSchema,
  AdminOrdersListResponseSchema,
  AdminOrdersQuerySchema,
  ApiErrorSchema,
  getNextOrderStatus,
  OrderDetailResponseSchema,
  OrdersListResponseSchema,
  UpdateOrderStatusInputSchema,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type Order,
  type OrderStatus,
} from "@shared"
import type {
  Order as PrismaOrder,
  OrderItem as PrismaOrderItem,
  OrderStatus as PrismaOrderStatus,
  Prisma,
  User as PrismaUser,
} from "@prisma/client"
import { Router } from "express"
import { prisma } from "../db/prisma"
import { requireAdmin } from "../middleware/requireAdmin"
import { requireAuth } from "../middleware/requireAuth"

export const ordersRouter = Router()
// `requireAuth` is applied per-route below (not a blanket `.use()`) so
// unmatched paths sharing this router's root mount still fall through to
// `notFoundHandler` instead of being intercepted here.

/**
 * schema.prisma's `OrderStatus` enum is uppercase, the wire schema is
 * Title-Case. Both intentional - same pattern as `toAuthUser()` in
 * routes/auth.ts. Exported so routes/webhooks.ts doesn't need its own copy.
 */
const STATUS_MAP: Record<PrismaOrderStatus, OrderStatus> = {
  PLACED: "Placed",
  BUILDING: "Building",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
}

export function toOrderStatus(status: PrismaOrderStatus): OrderStatus {
  return STATUS_MAP[status]
}

/**
 * Reverse of `STATUS_MAP` above, needed because
 * `PATCH /api/admin/orders/:id/status` writes a status (every other route
 * only ever reads one). Same wire<->DB split, opposite direction.
 */
const REVERSE_STATUS_MAP: Record<OrderStatus, PrismaOrderStatus> = {
  Placed: "PLACED",
  Building: "BUILDING",
  Shipped: "SHIPPED",
  Delivered: "DELIVERED",
}

/**
 * Locked transition sequence - linear, forward-only, no skip, no backward,
 * `Delivered` terminal. `getNextOrderStatus` (shared/src/admin.ts) returns
 * `undefined` for `Delivered` (nothing is ever valid after it) - a request
 * that doesn't match the single returned value is a 409
 * `INVALID_TRANSITION`, never a 400 (the body is shape-valid, it's the
 * state transition that's rejected). Imported from `@shared` rather than a
 * server-local copy so this route and `AdminOrders.tsx`'s "Mark as
 * {next status}" button can never drift apart on what "next" means.
 */

/** Prisma row (with its `items` relation loaded) -> wire `Order` shape, shared by the customer-facing detail route and the admin detail route below. */
function toOrderDetail(row: PrismaOrder & { items: PrismaOrderItem[] }): Order {
  return {
    id: row.id,
    userId: row.userId,
    orderNumber: row.orderNumber,
    status: toOrderStatus(row.status),
    subtotal: row.subtotal,
    tax: row.tax,
    shipping: row.shipping,
    total: row.total,
    currency: row.currency,
    shippingAddressId: row.shippingAddressId,
    billingAddressId: row.billingAddressId,
    placedAt: row.placedAt.toISOString(),
    stripePaymentIntentId: row.stripePaymentIntentId,
    items: row.items.map((i) => ({
      id: i.id,
      orderId: i.orderId,
      productId: i.productId,
      variantId: i.variantId ?? undefined,
      customBuildId: i.customBuildId ?? undefined,
      name: i.name,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
  }
}

// GET /api/orders - newest-first, summary shape, empty array if none.
ordersRouter.get("/api/orders", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id
    const rows = await prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      include: { _count: { select: { items: true } } },
    })

    const orders = rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: toOrderStatus(o.status),
      total: o.total,
      currency: o.currency,
      placedAt: o.placedAt.toISOString(),
      itemCount: o._count.items,
    }))

    res.status(200).json(OrdersListResponseSchema.parse({ orders }))
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:id - full detail incl. items. 404 (never 403) whether
// the order doesn't exist or belongs to another user - same "don't leak
// existence" rule as the login route's INVALID_CREDENTIALS and the cart
// routes.
ordersRouter.get<{ id: string }>("/api/orders/:id", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user!.id

    const row = await prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    })

    if (!row) {
      res.status(404).json(ApiErrorSchema.parse({ error: { message: "Order not found", code: "NOT_FOUND" } }))
      return
    }

    res.status(200).json(OrderDetailResponseSchema.parse({ order: toOrderDetail(row) }))
  } catch (err) {
    next(err)
  }
})

// ---------------------------------------------------------------------------
// Admin orders table. Mounted on this router since every admin route
// needs auth anyway, so these routes chain `requireAuth, requireAdmin`
// per-route - `requireAuth` must run explicitly before `requireAdmin`,
// which depends on `req.user` already being populated (see
// requireAdmin.ts's doc comment). No mount-order footgun here (unlike
// buildsRouter/dropsRouter, which need early mounting specifically because
// they have public routes; nothing here is public).
// ---------------------------------------------------------------------------

type OrderWithCustomer = PrismaOrder & { user: PrismaUser | null }

/** Shared customer-identity mapping for both admin shapes below - `Order.userId` is nullable (see schema.prisma's doc comment), so both fields stay nullable rather than asserting non-null. */
function customerFields(row: { user: PrismaUser | null }): { customerEmail: string | null; customerName: string | null } {
  return {
    customerEmail: row.user?.email ?? null,
    customerName: row.user?.displayName ?? null,
  }
}

function toAdminOrderSummary(row: OrderWithCustomer & { _count: { items: number } }): AdminOrderSummary {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: toOrderStatus(row.status),
    total: row.total,
    currency: row.currency,
    placedAt: row.placedAt.toISOString(),
    itemCount: row._count.items,
    ...customerFields(row),
  }
}

function toAdminOrderDetail(row: OrderWithCustomer & { items: PrismaOrderItem[] }): AdminOrderDetail {
  return { ...toOrderDetail(row), ...customerFields(row) }
}

function notFoundOrder(id: string | undefined): { message: string; code: "NOT_FOUND" } {
  return { message: `Order "${id ?? ""}" not found`, code: "NOT_FOUND" }
}

// GET /api/admin/orders - paginated, filterable by status, searchable by
// orderNumber or customer email.
ordersRouter.get("/api/admin/orders", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const query = AdminOrdersQuerySchema.parse(req.query)
    const { status, search, page, pageSize } = query

    const where: Prisma.OrderWhereInput = {}
    if (status) where.status = REVERSE_STATUS_MAP[status]
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: true, _count: { select: { items: true } } },
      }),
      prisma.order.count({ where }),
    ])

    const orders = rows.map(toAdminOrderSummary)
    res.status(200).json(AdminOrdersListResponseSchema.parse({ orders, total, page, pageSize }))
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/orders/:id - admin can open ANY order (no per-user scoping,
// unlike GET /api/orders/:id above) - a real 404 only when the id genuinely
// doesn't exist.
ordersRouter.get<{ id: string }>("/api/admin/orders/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const row = await prisma.order.findUnique({ where: { id }, include: { items: true, user: true } })
    if (!row) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundOrder(id) }))
      return
    }
    res.status(200).json(AdminOrderDetailResponseSchema.parse({ order: toAdminOrderDetail(row) }))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/admin/orders/:id/status - the only admin-write route on
// orders. See `nextAllowedStatus` above for the locked linear
// Placed->Building->Shipped->Delivered rule; any other requested transition
// (skip-ahead, backward, same-state, or off of Delivered) is 409
// INVALID_TRANSITION, not 400 - the body itself is shape-valid.
ordersRouter.patch<{ id: string }>("/api/admin/orders/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const input = UpdateOrderStatusInputSchema.parse(req.body)

    const existing = await prisma.order.findUnique({ where: { id }, include: { items: true, user: true } })
    if (!existing) {
      res.status(404).json(ApiErrorSchema.parse({ error: notFoundOrder(id) }))
      return
    }

    const currentStatus = toOrderStatus(existing.status)
    const allowed = getNextOrderStatus(currentStatus)
    if (allowed !== input.status) {
      res.status(409).json(
        ApiErrorSchema.parse({
          error: {
            message:
              allowed === undefined
                ? `Order is already "${currentStatus}". No further status transitions are valid.`
                : `Order is "${currentStatus}". The only valid next status is "${allowed}", not "${input.status}".`,
            code: "INVALID_TRANSITION",
          },
        }),
      )
      return
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: REVERSE_STATUS_MAP[input.status] },
      include: { items: true, user: true },
    })

    res.status(200).json(AdminOrderDetailResponseSchema.parse({ order: toAdminOrderDetail(updated) }))
  } catch (err) {
    next(err)
  }
})
