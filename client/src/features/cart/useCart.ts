import { useEffect } from "react"
import { toast } from "sonner"
import type { CartItemSnapshot } from "@shared"
import { useAuth } from "@/lib/auth"
import { useGuestCartStore } from "./guestStore"
import {
  useAddCartItemMutation,
  useRemoveCartItemMutation,
  useServerCartQuery,
  useUpdateCartItemMutation,
} from "./serverCart"

export interface AddToCartInput {
  productId: string
  variantId?: string
  /**
   * FK to an already-persisted `CustomBuild` row (`POST /api/builds` must be
   * called first; there's no "inline unsaved build" cart line type).
   * Server-only - `POST /api/builds` requires `requireAuth`, so this must
   * never be set on the guest branch below.
   */
  customBuildId?: string
  quantity: number
  /**
   * Guest-store-only. When signed in these are ignored - the server derives
   * name/price from the catalog on every write, since the client price can't
   * be trusted for any cart write, not just checkout.
   */
  name: string
  unitPrice: number
}

export interface CartApi {
  items: CartItemSnapshot[]
  count: number
  /** True while the backing cart's first load is in flight. Guest mode is always ready (no network round-trip); server mode is true until the first `GET /api/cart` response lands. */
  isLoading: boolean
  /**
   * Clock-skew baseline for any `item.dropReservation` countdown. Guest carts
   * never carry a `dropReservation` line (group-buy reservations require
   * auth), so the local timestamp fallback here is never read against a real
   * countdown.
   */
  serverNow: string
  addItem: (input: AddToCartInput) => void
  updateQuantity: (itemId: string, quantity: number) => void
  removeItem: (itemId: string) => void
}

function countItems(items: CartItemSnapshot[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

/**
 * Single seam every cart-reading component reads through - none of them
 * know or care whether the backing store is the guest Zustand store or the
 * DB-backed cart. Both branches' hooks are called unconditionally (rules of
 * hooks); only one branch's data is returned per render, switching live the
 * instant `useAuth()` flips. Right after login the UI starts reading the
 * server cart before the merge mutation resolves, so it's briefly empty
 * until `useCartMergeOnSignIn` finishes merging in the guest items.
 */
export function useCart(): CartApi {
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const guestItems = useGuestCartStore((s) => s.items)
  const guestAddItem = useGuestCartStore((s) => s.addItem)
  const guestUpdateQuantity = useGuestCartStore((s) => s.updateQuantity)
  const guestRemoveItem = useGuestCartStore((s) => s.removeItem)

  const serverCartQuery = useServerCartQuery(isAuthenticated)
  const addMutation = useAddCartItemMutation()
  const updateMutation = useUpdateCartItemMutation()
  const removeMutation = useRemoveCartItemMutation()

  // `GET /api/cart`'s lazy drop-reservation-expiry sweep reports any lines
  // it just removed via `expiredLineNames`; this is the one place that
  // surfaces it since react-query v5 dropped `onSuccess` from useQuery.
  useEffect(() => {
    const names = serverCartQuery.data?.expiredLineNames
    if (!names || names.length === 0) return
    for (const name of names) {
      toast.info(`Your hold on ${name} expired and was released`, {
        description: "Those reserved units are back in the pool for everyone.",
      })
    }
    // Re-fire only when a fresh GET /api/cart response object lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverCartQuery.data])

  if (isAuthenticated) {
    const items = serverCartQuery.data?.cart.items ?? []
    return {
      items,
      count: countItems(items),
      isLoading: authLoading || serverCartQuery.isPending,
      serverNow: serverCartQuery.data?.cart.serverNow ?? new Date().toISOString(),
      addItem: (input) => {
        addMutation.mutate({
          productId: input.productId,
          variantId: input.variantId,
          customBuildId: input.customBuildId,
          quantity: input.quantity,
        })
      },
      updateQuantity: (itemId, quantity) => {
        updateMutation.mutate({ itemId, input: { quantity: Math.max(1, Math.trunc(quantity)) } })
      },
      removeItem: (itemId) => {
        removeMutation.mutate(itemId)
      },
    }
  }

  return {
    items: guestItems,
    count: countItems(guestItems),
    isLoading: authLoading,
    serverNow: new Date().toISOString(),
    addItem: (input) =>
      guestAddItem({
        productId: input.productId,
        variantId: input.variantId,
        name: input.name,
        unitPrice: input.unitPrice,
        quantity: input.quantity,
      }),
    updateQuantity: guestUpdateQuantity,
    removeItem: guestRemoveItem,
  }
}
