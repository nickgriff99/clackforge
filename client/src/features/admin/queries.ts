import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type {
  AdminOrderDetailResponse,
  AdminProductResponse,
  AdminUpdateDropInput,
  CreateProductInput,
  CreateVariantInput,
  UpdateOrderStatusInput,
  UpdateProductInput,
} from "@shared"
import {
  type AdminOrderListQuery,
  type AdminProductListQuery,
  ApiRequestError,
  archiveAdminProductRequest,
  createAdminProductRequest,
  createAdminVariantRequest,
  deleteAdminVariantRequest,
  fetchAdminDashboardOrdersSummary,
  fetchAdminDashboardTopOptions,
  fetchAdminDrop,
  fetchAdminOrderById,
  fetchAdminOrders,
  fetchAdminProductById,
  fetchAdminProducts,
  resetDemoDataRequest,
  updateAdminDropRequest,
  updateAdminOrderStatusRequest,
  updateAdminProductRequest,
  updateAdminVariantRequest,
} from "@/lib/api"
import { dropKeys } from "@/features/drops/queries"

/**
 * Admin product/variant CRUD + orders table query layer. Stable key
 * factories, same convention as `catalogKeys`/`orderKeys` elsewhere in
 * `features/*` - list keys carry the full query object (one cache entry per
 * filter/page combination, matches the Shop page's established pattern).
 */
export const adminProductKeys = {
  all: ["admin", "products"] as const,
  list: (query: AdminProductListQuery) => [...adminProductKeys.all, "list", query] as const,
  detail: (id: string) => [...adminProductKeys.all, "detail", id] as const,
}

export const adminOrderKeys = {
  all: ["admin", "orders"] as const,
  list: (query: AdminOrderListQuery) => [...adminOrderKeys.all, "list", query] as const,
  detail: (id: string) => [...adminOrderKeys.all, "detail", id] as const,
}

/** Admin dashboard widgets (orders-summary/top-options are each a single, un-paginated, un-filtered GET - one fixed key apiece, no query-object variant needed). */
export const adminDashboardKeys = {
  ordersSummary: ["admin", "dashboard", "orders-summary"] as const,
  topOptions: ["admin", "dashboard", "top-options"] as const,
}

/** Admin group-buy drop detail, keyed by slug (same shape as `adminProductKeys.detail`). */
export const adminDropKeys = {
  all: ["admin", "drops"] as const,
  detail: (slug: string) => [...adminDropKeys.all, "detail", slug] as const,
}

function adminErrorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server."
}

// --- Products --------------------------------------------------------------

export function useAdminProducts(query: AdminProductListQuery) {
  return useQuery({
    queryKey: adminProductKeys.list(query),
    queryFn: () => fetchAdminProducts(query),
    placeholderData: keepPreviousData,
  })
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: adminProductKeys.detail(id ?? ""),
    queryFn: () => fetchAdminProductById(id ?? ""),
    enabled: id !== undefined && id.length > 0,
    retry: (failureCount, error) => {
      // Same "don't retry a real 404" convention as useProduct/useDropState
      // (features/catalog/queries.ts) - retrying just delays the not-found
      // state for no benefit.
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

/** Invalidates every admin products LIST (any filter/page combo) - used after any write that can change list-visible fields (name/status/aggregate stock). Detail caches are updated directly by each mutation below, not invalidated wholesale. */
function invalidateAdminProductLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...adminProductKeys.all, "list"] })
}

export function useCreateAdminProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProductInput) => createAdminProductRequest(input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminProductKeys.detail(data.product.id), data)
      invalidateAdminProductLists(queryClient)
      toast.success("Product created", { description: data.product.name })
    },
    onError: (err) => toast.error("Couldn't create product", { description: adminErrorMessage(err) }),
  })
}

export function useUpdateAdminProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) => updateAdminProductRequest(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminProductKeys.detail(data.product.id), data)
      invalidateAdminProductLists(queryClient)
      toast.success("Product updated")
    },
    onError: (err) => toast.error("Couldn't update product", { description: adminErrorMessage(err) }),
  })
}

/** `DELETE /api/admin/products/:id` - soft delete (`status: "archived"`). Named "archive" here, not "delete", to match what it actually does. */
export function useArchiveAdminProductMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveAdminProductRequest(id),
    onSuccess: (data) => {
      queryClient.setQueryData(adminProductKeys.detail(data.product.id), data)
      invalidateAdminProductLists(queryClient)
      toast.success("Product archived", { description: data.product.name })
    },
    onError: (err) => toast.error("Couldn't archive product", { description: adminErrorMessage(err) }),
  })
}

export function useCreateAdminVariantMutation(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVariantInput) => createAdminVariantRequest(productId, input),
    onSuccess: (data) => {
      queryClient.setQueryData<AdminProductResponse>(adminProductKeys.detail(productId), (old) =>
        old ? { product: { ...old.product, variants: [...old.product.variants, data.variant] } } : old,
      )
      invalidateAdminProductLists(queryClient)
      toast.success("Variant added", { description: data.variant.name })
    },
    onError: (err) => toast.error("Couldn't add variant", { description: adminErrorMessage(err) }),
  })
}

/**
 * `PATCH /api/admin/variants/:id` - the one optimistic mutation in this
 * file. Backs `AdminProductEdit.tsx`'s inline on-blur stock input: the
 * number must update the instant the admin blurs the field, with a
 * rollback-on-error toast if the write fails. Note: this isn't copied from
 * an existing "cart quantity update" optimistic pattern -
 * `features/cart/serverCart.ts`'s mutations are plain
 * `onSuccess`-cache-replace / `onError`-toast, with no `onMutate`
 * optimistic branch at all. Built fresh here instead.
 */
export function useUpdateVariantStockMutation(productId: string) {
  const queryClient = useQueryClient()
  const detailKey = adminProductKeys.detail(productId)

  return useMutation({
    mutationFn: ({ variantId, stock }: { variantId: string; stock: number }) =>
      updateAdminVariantRequest(variantId, { stock }),
    onMutate: async ({ variantId, stock }) => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previous = queryClient.getQueryData<AdminProductResponse>(detailKey)
      if (previous) {
        queryClient.setQueryData<AdminProductResponse>(detailKey, {
          product: {
            ...previous.product,
            variants: previous.product.variants.map((v) => (v.id === variantId ? { ...v, stock } : v)),
          },
        })
      }
      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(detailKey, context.previous)
      toast.error("Couldn't update stock", { description: adminErrorMessage(err) })
    },
    onSuccess: (data) => {
      // `data` is an `AdminVariantResponse` (`{ variant }`), NOT an
      // `AdminProductResponse` (`{ product }`) - this mutation's endpoint is
      // the variant PATCH, not the product GET. Must merge the updated
      // variant back into the existing product's variants array (same
      // pattern as useDeleteAdminVariantMutation's onSuccess below), not
      // overwrite the whole cache slot with the mismatched shape - doing so
      // previously left `detailKey` holding `{ variant }`, so the next
      // render's `data.product.name` read crashed on every product.
      queryClient.setQueryData<AdminProductResponse>(detailKey, (old) =>
        old
          ? {
              product: {
                ...old.product,
                variants: old.product.variants.map((v) => (v.id === data.variant.id ? data.variant : v)),
              },
            }
          : old,
      )
    },
    onSettled: () => {
      // totalStock is a list-row aggregate, not visible on the detail cache
      // this mutation already keeps in sync above - refresh list caches only.
      invalidateAdminProductLists(queryClient)
    },
  })
}

/** `DELETE /api/admin/variants/:id` - soft delete (`stock: 0`), row never removed. Plain success/error, not optimistic. */
export function useDeleteAdminVariantMutation(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (variantId: string) => deleteAdminVariantRequest(variantId),
    onSuccess: (data) => {
      queryClient.setQueryData<AdminProductResponse>(adminProductKeys.detail(productId), (old) =>
        old
          ? {
              product: {
                ...old.product,
                variants: old.product.variants.map((v) => (v.id === data.variant.id ? data.variant : v)),
              },
            }
          : old,
      )
      invalidateAdminProductLists(queryClient)
      toast.success("Variant stock cleared")
    },
    onError: (err) => toast.error("Couldn't remove variant", { description: adminErrorMessage(err) }),
  })
}

// --- Orders ------------------------------------------------------------

export function useAdminOrders(query: AdminOrderListQuery) {
  return useQuery({
    queryKey: adminOrderKeys.list(query),
    queryFn: () => fetchAdminOrders(query),
    placeholderData: keepPreviousData,
  })
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: adminOrderKeys.detail(id ?? ""),
    queryFn: () => fetchAdminOrderById(id ?? ""),
    enabled: id !== undefined && id.length > 0,
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

/** 409 `INVALID_TRANSITION` is a real, expected outcome (another admin raced ahead of this one on a stale page) - surfaced as a normal error toast, not swallowed; the row's cache stays untouched so the UI still shows the correct "already moved on" state after refetch. */
export function useUpdateAdminOrderStatusMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrderStatusInput }) => updateAdminOrderStatusRequest(id, input),
    onSuccess: (data: AdminOrderDetailResponse) => {
      queryClient.setQueryData(adminOrderKeys.detail(data.order.id), data)
      queryClient.invalidateQueries({ queryKey: [...adminOrderKeys.all, "list"] })
      toast.success("Order status updated", { description: `#${data.order.orderNumber} -> ${data.order.status}` })
    },
    onError: (err) => toast.error("Couldn't update order status", { description: adminErrorMessage(err) }),
  })
}

// --- Dashboard -----------------------------------------------------------

/**
 * Two independently-fetching widgets, two independent `useQuery` calls -
 * `AdminDashboard.tsx` renders each one's own loading/error/empty state
 * separately (same resilience pattern as `Account.tsx`'s
 * `OrderHistoryList`/`SavedBuildsList`), so one widget's query failing can
 * never blank the other.
 */
export function useAdminDashboardOrdersSummary() {
  return useQuery({
    queryKey: adminDashboardKeys.ordersSummary,
    queryFn: fetchAdminDashboardOrdersSummary,
  })
}

export function useAdminDashboardTopOptions() {
  return useQuery({
    queryKey: adminDashboardKeys.topOptions,
    queryFn: fetchAdminDashboardTopOptions,
  })
}

/**
 * `POST /api/admin/reset-demo-data` - invalidates every admin-surface query
 * cache (products list, orders list, both dashboard widgets, group-buy
 * drop detail), not just the dashboard's own two - a reset also
 * wipes/reseeds products/variants/orders and resets the drop's
 * soldCount/totalStock, so every other admin screen's cached data is stale
 * too the instant this succeeds.
 */
export function useResetDemoDataMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetDemoDataRequest,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all })
      queryClient.invalidateQueries({ queryKey: adminOrderKeys.all })
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.ordersSummary })
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.topOptions })
      queryClient.invalidateQueries({ queryKey: adminDropKeys.all })
      const c = data.counts
      toast.success("Demo data reset", {
        description: `${c.products} products · ${c.variants} variants · ${c.orders} orders · ${c.customBuilds} builds · ${c.groupBuyDrops} drop`,
      })
    },
    onError: (err) => toast.error("Couldn't reset demo data", { description: adminErrorMessage(err) }),
  })
}

// --- Group Buy admin -------------------------------------------------------

export function useAdminDrop(slug: string) {
  return useQuery({
    queryKey: adminDropKeys.detail(slug),
    queryFn: () => fetchAdminDrop(slug),
    retry: (failureCount, error) => {
      // Same "don't retry a real 404" convention as useAdminProduct/useAdminOrder above.
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

/**
 * `PATCH /api/admin/drops/:slug` - 400 `VALIDATION_ERROR` is an expected,
 * renderable outcome (totalStock below the already-sold-or-reserved floor)
 * - surfaced via the error toast, not swallowed. Also invalidates the
 * public drop query (`dropKeys.detail`, features/drops/queries.ts) so this
 * page's own "current status" context panel (which reads the public
 * computed-status route, not this admin route) reflects the edit
 * immediately instead of waiting up to 3s for its next poll.
 */
export function useUpdateAdminDropMutation(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AdminUpdateDropInput) => updateAdminDropRequest(slug, input),
    onSuccess: (data) => {
      queryClient.setQueryData(adminDropKeys.detail(slug), data)
      queryClient.invalidateQueries({ queryKey: dropKeys.detail(slug) })
      toast.success("Drop updated")
    },
    onError: (err) => toast.error("Couldn't update drop", { description: adminErrorMessage(err) }),
  })
}
