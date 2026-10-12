import {
  AdminDashboardOrdersSummaryResponseSchema,
  AdminDropResponseSchema,
  AdminOrderDetailResponseSchema,
  AdminOrdersListResponseSchema,
  AdminProductResponseSchema,
  AdminProductsListResponseSchema,
  AdminResetDemoDataResponseSchema,
  AdminTopOptionsResponseSchema,
  AdminVariantResponseSchema,
  ApiErrorSchema,
  AuthResponseSchema,
  SessionResponseSchema,
  BuildDetailResponseSchema,
  CartResponseSchema,
  CheckoutSessionResponseSchema,
  CreateBuildResponseSchema,
  DropStateResponseSchema,
  OrderDetailResponseSchema,
  OrdersListResponseSchema,
  ProductDetailResponseSchema,
  ProductsListResponseSchema,
  RenameBuildResponseSchema,
  ReserveDropResponseSchema,
  SavedBuildsListResponseSchema,
  type AddCartItemInput,
  type AdminDashboardOrdersSummaryResponse,
  type AdminDropResponse,
  type AdminOrderDetailResponse,
  type AdminOrdersListResponse,
  type AdminProductResponse,
  type AdminProductsListResponse,
  type AdminResetDemoDataResponse,
  type AdminTopOptionsResponse,
  type AdminUpdateDropInput,
  type AdminVariantResponse,
  type AuthResponse,
  type BuildDetailResponse,
  type CartResponse,
  type CheckoutSessionResponse,
  type CreateBuildResponse,
  type CreateCustomBuildInput,
  type CreateProductInput,
  type CreateVariantInput,
  type DropStateResponse,
  type LoginInput,
  type MergeCartInput,
  type OrderDetailResponse,
  type OrderStatus,
  type OrdersListResponse,
  type ProductDetailResponse,
  type ProductsListResponse,
  type ProductsSort,
  type ProductStatus,
  type ProductType,
  type RegisterInput,
  type RenameBuildResponse,
  type RenameSavedBuildInput,
  type ReserveDropInput,
  type ReserveDropResponse,
  type SavedBuildsListResponse,
  type UpdateCartItemInput,
  type UpdateOrderStatusInput,
  type UpdateProductInput,
  type UpdateVariantInput,
} from "@shared"

/**
 * Client-side query shape - intentionally NOT `@shared`'s `ProductsQuery`.
 * That type is the server's POST-transform output (`inStock` is already a
 * real `boolean`), but the wire format Express/Zod expects on `req.query`
 * is pre-transform strings (`inStock=true`/`"false"`). Keeping a separate
 * client type makes that string-vs-boolean boundary explicit instead of
 * fighting the server type end-to-end.
 */
export interface ProductListQuery {
  type?: ProductType
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  sort?: ProductsSort
  page?: number
  pageSize?: number
}

/**
 * Base URL for API calls. In dev the API runs on its own port. In production
 * the static site proxies `/api/*` to the API (see `render.yaml`), so the
 * default is an empty string and every call is a same-origin relative URL,
 * which keeps the session cookie first-party. Set `VITE_API_URL` to override.
 */
const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : "")

/** Thrown on any non-2xx response. Carries the server's `ApiError` envelope when present. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code: string | undefined) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
  }
}

async function throwForResponse(res: Response): Promise<never> {
  let message = `Request failed with status ${res.status}`
  let code: string | undefined
  try {
    const body: unknown = await res.json()
    const parsed = ApiErrorSchema.safeParse(body)
    if (parsed.success) {
      message = parsed.data.error.message
      code = parsed.data.error.code
    }
  } catch {
    // Body wasn't JSON (or didn't match the ApiError envelope) - fall back
    // to the generic status-based message above.
  }
  throw new ApiRequestError(message, res.status, code)
}

function buildProductsSearchParams(query: ProductListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.type) params.set("type", query.type)
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice))
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice))
  if (query.inStock !== undefined) params.set("inStock", query.inStock ? "true" : "false")
  if (query.sort) params.set("sort", query.sort)
  if (query.page !== undefined) params.set("page", String(query.page))
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize))
  return params
}

export async function fetchProducts(query: ProductListQuery): Promise<ProductsListResponse> {
  const params = buildProductsSearchParams(query)
  const res = await fetch(`${API_URL}/api/products?${params.toString()}`, {
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return ProductsListResponseSchema.parse(await res.json())
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetailResponse> {
  const res = await fetch(`${API_URL}/api/products/${encodeURIComponent(slug)}`, {
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return ProductDetailResponseSchema.parse(await res.json())
}

/**
 * `GET /api/auth/me` doubles as "is anyone logged in." The server answers 200
 * with `{ user: null }` when signed out, so this resolves to `null` (a real
 * query result, not an error state) without a failed request in the console.
 * Any non-2xx (network blip, 500) still throws via `throwForResponse`.
 */
export async function fetchMe(): Promise<AuthResponse | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  const { user } = SessionResponseSchema.parse(await res.json())
  return user ? { user } : null
}

export async function registerRequest(input: RegisterInput): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AuthResponseSchema.parse(await res.json())
}

export async function loginRequest(input: LoginInput): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AuthResponseSchema.parse(await res.json())
}

/**
 * `POST /api/auth/try-as-admin` - no request body, logs the caller into
 * the same real seeded admin account a normal login would. Returns the
 * exact `AuthResponseSchema` shape as login/me, reused verbatim (see
 * `useTryAsAdminMutation` in `lib/auth.tsx`).
 */
export async function tryAsAdminRequest(): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/try-as-admin`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return AuthResponseSchema.parse(await res.json())
}

/** `POST /api/auth/logout` is 204 No Content on success - nothing to parse. */
export async function logoutRequest(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
}

/**
 * Full-page redirect target, not a fetch target - callers point an
 * `<a href>`/`window.location` here, never `fetch()` it. In dev this is the
 * API's own origin (the client dev server does not proxy /api). In production
 * it is a relative path that the static site's rewrite forwards to Express.
 */
export function googleAuthUrl(): string {
  return `${API_URL}/api/auth/google`
}

// ---------------------------------------------------------------------------
// Cart sync, checkout, orders. All of these require the session cookie
// (`credentials: "include"`); a 401 here means "signed out," which
// `useCart()`/`ProtectedRoute` should never let these fire from in the
// first place, but `throwForResponse` surfaces it as a normal
// ApiRequestError if it ever does (e.g. a session expiring mid-page).
// ---------------------------------------------------------------------------

export async function fetchCart(): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/api/cart`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return CartResponseSchema.parse(await res.json())
}

export async function addCartItemRequest(input: AddCartItemInput): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/api/cart/items`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return CartResponseSchema.parse(await res.json())
}

export async function updateCartItemRequest(itemId: string, input: UpdateCartItemInput): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return CartResponseSchema.parse(await res.json())
}

export async function removeCartItemRequest(itemId: string): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return CartResponseSchema.parse(await res.json())
}

/** Called once, right after a successful login/register/Google-OAuth landing - see `useCartMergeOnSignIn`. */
export async function mergeCartRequest(input: MergeCartInput): Promise<CartResponse> {
  const res = await fetch(`${API_URL}/api/cart/merge`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return CartResponseSchema.parse(await res.json())
}

/**
 * No request body - the server reads the DB cart and recalculates every
 * price itself. Will currently fail with 500 `INTERNAL_ERROR` ("Stripe is
 * not configured") until real Stripe test-mode keys are supplied - an
 * expected, documented gap, not a client bug. Callers must render that
 * failure as a graceful "checkout is temporarily unavailable" state, not
 * a raw error dump.
 */
export async function createCheckoutSessionRequest(): Promise<CheckoutSessionResponse> {
  const res = await fetch(`${API_URL}/api/checkout/session`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return CheckoutSessionResponseSchema.parse(await res.json())
}

export async function fetchOrders(): Promise<OrdersListResponse> {
  const res = await fetch(`${API_URL}/api/orders`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return OrdersListResponseSchema.parse(await res.json())
}

export async function fetchOrderById(id: string): Promise<OrderDetailResponse> {
  const res = await fetch(`${API_URL}/api/orders/${encodeURIComponent(id)}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return OrderDetailResponseSchema.parse(await res.json())
}

// ---------------------------------------------------------------------------
// Saved builds, share-by-id. `fetchBuildById` is the one public call in
// this block (no session required server-side) - `credentials: "include"`
// is still harmless to send; the route simply never reads req.user.
// ---------------------------------------------------------------------------

/**
 * `POST /api/builds` - mints a shareable `CustomBuild`, and (when `label` is
 * set on the input) also saves it to the user's Account list in the same
 * request. Requires a session; never called while signed out (the Save
 * button's own auth check short-circuits before reaching this call).
 */
export async function createBuildRequest(input: CreateCustomBuildInput): Promise<CreateBuildResponse> {
  const res = await fetch(`${API_URL}/api/builds`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return CreateBuildResponseSchema.parse(await res.json())
}

/** `GET /api/builds` - the current user's saved builds (Account page list). Auth required. */
export async function fetchSavedBuilds(): Promise<SavedBuildsListResponse> {
  const res = await fetch(`${API_URL}/api/builds`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return SavedBuildsListResponseSchema.parse(await res.json())
}

/** `GET /api/builds/:id` - public, no auth. Backs both `/b/:id` and the Account list's "open" link. */
export async function fetchBuildById(id: string): Promise<BuildDetailResponse> {
  const res = await fetch(`${API_URL}/api/builds/${encodeURIComponent(id)}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return BuildDetailResponseSchema.parse(await res.json())
}

/** `PATCH /api/builds/:id` - rename. Auth required, must own (server 404s otherwise). */
export async function renameSavedBuildRequest(id: string, input: RenameSavedBuildInput): Promise<RenameBuildResponse> {
  const res = await fetch(`${API_URL}/api/builds/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return RenameBuildResponseSchema.parse(await res.json())
}

/** `DELETE /api/builds/:id` - 204 No Content on success. Auth required, must own. */
export async function deleteSavedBuildRequest(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/builds/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
}

// ---------------------------------------------------------------------------
// Group Buy / Drop. `fetchDropState` is public (no session required
// server-side, same as fetchProductBySlug) - `credentials: "include"` is
// still harmless to send. The reserve/release calls require a session; the
// page gates the Reserve action on `useAuth().isAuthenticated` before ever
// calling `reserveDropRequest`, same convention as every other auth-gated
// mutation in this file.
// ---------------------------------------------------------------------------

/** `GET /api/drops/:slug` - public. Poll this (see DropDetail.tsx's `refetchInterval`) for live stock/status across browsers. */
export async function fetchDropState(slug: string): Promise<DropStateResponse> {
  const res = await fetch(`${API_URL}/api/drops/${encodeURIComponent(slug)}`, {
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return DropStateResponseSchema.parse(await res.json())
}

/**
 * `POST /api/drops/:slug/reserve` - auth required. 409 `DROP_NOT_LIVE`/
 * `SOLD_OUT` are expected, renderable outcomes (see
 * `DropErrorCodeSchema` in shared/src/groupBuyDrop.ts), not just generic
 * failures - callers should branch on `ApiRequestError.code`, same pattern
 * as checkout's `EMPTY_CART`/`OUT_OF_STOCK`.
 */
export async function reserveDropRequest(slug: string, input: ReserveDropInput): Promise<ReserveDropResponse> {
  const res = await fetch(`${API_URL}/api/drops/${encodeURIComponent(slug)}/reserve`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return ReserveDropResponseSchema.parse(await res.json())
}

/** `DELETE /api/drops/:slug/reserve` - auth required, 204 No Content, idempotent (no ACTIVE reservation is still a success). */
export async function releaseDropReservationRequest(slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/drops/${encodeURIComponent(slug)}/reserve`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
}

// ---------------------------------------------------------------------------
// Admin product/variant CRUD + orders table. Every call below requires an
// admin session; a non-admin signed-in user gets a real 403 FORBIDDEN (not
// 401 - they are authenticated, just not authorized), surfaced as a normal
// `ApiRequestError` same as any other non-2xx. `AdminRoute` (lib/auth.tsx)
// keeps a non-admin from ever reaching a page that would call these, but
// these functions don't themselves assume that guard ran - a session
// expiring mid-page still surfaces correctly.
// ---------------------------------------------------------------------------

/** Same string-wire-coercion caveat as `ProductListQuery` above - `page`/`pageSize` cross the wire as strings. */
export interface AdminProductListQuery {
  type?: ProductType
  status?: ProductStatus
  search?: string
  sort?: ProductsSort
  page?: number
  pageSize?: number
}

function buildAdminProductsSearchParams(query: AdminProductListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.type) params.set("type", query.type)
  if (query.status) params.set("status", query.status)
  if (query.search) params.set("search", query.search)
  if (query.sort) params.set("sort", query.sort)
  if (query.page !== undefined) params.set("page", String(query.page))
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize))
  return params
}

export async function fetchAdminProducts(query: AdminProductListQuery): Promise<AdminProductsListResponse> {
  const params = buildAdminProductsSearchParams(query)
  const res = await fetch(`${API_URL}/api/admin/products?${params.toString()}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminProductsListResponseSchema.parse(await res.json())
}

/** 409 `SLUG_TAKEN` is an expected, renderable outcome - callers should branch on `ApiRequestError.code`. */
export async function createAdminProductRequest(input: CreateProductInput): Promise<AdminProductResponse> {
  const res = await fetch(`${API_URL}/api/admin/products`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminProductResponseSchema.parse(await res.json())
}

export async function fetchAdminProductById(id: string): Promise<AdminProductResponse> {
  const res = await fetch(`${API_URL}/api/admin/products/${encodeURIComponent(id)}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminProductResponseSchema.parse(await res.json())
}

export async function updateAdminProductRequest(id: string, input: UpdateProductInput): Promise<AdminProductResponse> {
  const res = await fetch(`${API_URL}/api/admin/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminProductResponseSchema.parse(await res.json())
}

/** Soft delete (sets `status: "archived"`, see shared/src/admin.ts) - idempotent, still 200s on an already-archived product. */
export async function archiveAdminProductRequest(id: string): Promise<AdminProductResponse> {
  const res = await fetch(`${API_URL}/api/admin/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return AdminProductResponseSchema.parse(await res.json())
}

/** 409 `SKU_TAKEN` is an expected, renderable outcome - same branch-on-code convention as `createAdminProductRequest`. */
export async function createAdminVariantRequest(productId: string, input: CreateVariantInput): Promise<AdminVariantResponse> {
  const res = await fetch(`${API_URL}/api/admin/products/${encodeURIComponent(productId)}/variants`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminVariantResponseSchema.parse(await res.json())
}

export async function updateAdminVariantRequest(id: string, input: UpdateVariantInput): Promise<AdminVariantResponse> {
  const res = await fetch(`${API_URL}/api/admin/variants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminVariantResponseSchema.parse(await res.json())
}

/** Soft delete (sets `stock: 0`, row never removed) - idempotent. */
export async function deleteAdminVariantRequest(id: string): Promise<AdminVariantResponse> {
  const res = await fetch(`${API_URL}/api/admin/variants/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return AdminVariantResponseSchema.parse(await res.json())
}

export interface AdminOrderListQuery {
  status?: OrderStatus
  search?: string
  page?: number
  pageSize?: number
}

function buildAdminOrdersSearchParams(query: AdminOrderListQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.search) params.set("search", query.search)
  if (query.page !== undefined) params.set("page", String(query.page))
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize))
  return params
}

export async function fetchAdminOrders(query: AdminOrderListQuery): Promise<AdminOrdersListResponse> {
  const params = buildAdminOrdersSearchParams(query)
  const res = await fetch(`${API_URL}/api/admin/orders?${params.toString()}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminOrdersListResponseSchema.parse(await res.json())
}

export async function fetchAdminOrderById(id: string): Promise<AdminOrderDetailResponse> {
  const res = await fetch(`${API_URL}/api/admin/orders/${encodeURIComponent(id)}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminOrderDetailResponseSchema.parse(await res.json())
}

/** 409 `INVALID_TRANSITION` is an expected, renderable outcome - the UI never offers an invalid transition (see AdminOrders.tsx's single "Mark as {next}" button), but a stale page (another admin already advanced it) can still hit this live. */
export async function updateAdminOrderStatusRequest(
  id: string,
  input: UpdateOrderStatusInput,
): Promise<AdminOrderDetailResponse> {
  const res = await fetch(`${API_URL}/api/admin/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminOrderDetailResponseSchema.parse(await res.json())
}

// ---------------------------------------------------------------------------
// Admin dashboard (orders summary / top-options), group buy admin. Every
// call below requires an admin session, same auth shape as the block
// above.
// ---------------------------------------------------------------------------

export async function fetchAdminDashboardOrdersSummary(): Promise<AdminDashboardOrdersSummaryResponse> {
  const res = await fetch(`${API_URL}/api/admin/dashboard/orders-summary`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminDashboardOrdersSummaryResponseSchema.parse(await res.json())
}

export async function fetchAdminDashboardTopOptions(): Promise<AdminTopOptionsResponse> {
  const res = await fetch(`${API_URL}/api/admin/dashboard/top-options`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminTopOptionsResponseSchema.parse(await res.json())
}

/** `POST /api/admin/reset-demo-data` - wipes every order/build/the drop back to seed state (User rows untouched). No body. */
export async function resetDemoDataRequest(): Promise<AdminResetDemoDataResponse> {
  const res = await fetch(`${API_URL}/api/admin/reset-demo-data`, {
    method: "POST",
    credentials: "include",
  })
  if (!res.ok) return throwForResponse(res)
  return AdminResetDemoDataResponseSchema.parse(await res.json())
}

/** `GET /api/admin/drops/:slug` - admin detail (raw row, soldCount/isManuallyClosed visible), NOT the public derived shape `fetchDropState` returns. */
export async function fetchAdminDrop(slug: string): Promise<AdminDropResponse> {
  const res = await fetch(`${API_URL}/api/admin/drops/${encodeURIComponent(slug)}`, { credentials: "include" })
  if (!res.ok) return throwForResponse(res)
  return AdminDropResponseSchema.parse(await res.json())
}

/** `PATCH /api/admin/drops/:slug` - 400 `VALIDATION_ERROR` (totalStock below the sold+reserved floor) is an expected, renderable outcome. */
export async function updateAdminDropRequest(slug: string, input: AdminUpdateDropInput): Promise<AdminDropResponse> {
  const res = await fetch(`${API_URL}/api/admin/drops/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) return throwForResponse(res)
  return AdminDropResponseSchema.parse(await res.json())
}
