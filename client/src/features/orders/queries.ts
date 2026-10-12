import { useQuery } from "@tanstack/react-query"
import { fetchOrderById, fetchOrders } from "@/lib/api"

export const orderKeys = {
  all: ["orders"] as const,
  detail: (id: string) => ["orders", id] as const,
}

/** `GET /api/orders` - auth required (gated by `ProtectedRoute` at the route level, not here). Newest-first, empty array if none. */
export function useOrders() {
  return useQuery({
    queryKey: orderKeys.all,
    queryFn: fetchOrders,
  })
}

/** `GET /api/orders/:id` - 404 if the order doesn't exist OR belongs to another user (never 403, same leak-prevention rule as the cart routes). */
export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ""),
    queryFn: () => fetchOrderById(id ?? ""),
    enabled: Boolean(id),
  })
}
