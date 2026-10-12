import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { AddCartItemInput, CartResponse, MergeCartInput, UpdateCartItemInput } from "@shared"
import {
  addCartItemRequest,
  ApiRequestError,
  fetchCart,
  mergeCartRequest,
  removeCartItemRequest,
  updateCartItemRequest,
} from "@/lib/api"

/** Single query key - every mutation below seeds this cache entry directly from its response (full refreshed cart, never a partial diff), so nothing ever needs a follow-up invalidate+refetch. */
export const cartKeys = {
  root: ["cart"] as const,
}

function cartErrorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : "Something went wrong talking to the server."
}

/**
 * `enabled` gates the network call only - called unconditionally from
 * `useCart()` (rules of hooks) regardless of guest/signed-in state.
 */
export function useServerCartQuery(enabled: boolean) {
  return useQuery({
    queryKey: cartKeys.root,
    queryFn: fetchCart,
    enabled,
    staleTime: 10_000,
  })
}

export function useAddCartItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddCartItemInput) => addCartItemRequest(input),
    onSuccess: (data: CartResponse) => queryClient.setQueryData(cartKeys.root, data),
    onError: (err) => toast.error("Couldn't add to cart", { description: cartErrorMessage(err) }),
  })
}

export function useUpdateCartItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateCartItemInput }) =>
      updateCartItemRequest(itemId, input),
    onSuccess: (data: CartResponse) => queryClient.setQueryData(cartKeys.root, data),
    onError: (err) => toast.error("Couldn't update quantity", { description: cartErrorMessage(err) }),
  })
}

export function useRemoveCartItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => removeCartItemRequest(itemId),
    onSuccess: (data: CartResponse) => queryClient.setQueryData(cartKeys.root, data),
    onError: (err) => toast.error("Couldn't remove item", { description: cartErrorMessage(err) }),
  })
}

/** Called once by `useCartMergeOnSignIn` right after a login/register/Google-OAuth landing. */
export function useMergeCartMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MergeCartInput) => mergeCartRequest(input),
    onSuccess: (data: CartResponse) => queryClient.setQueryData(cartKeys.root, data),
    onError: (err) => toast.error("Couldn't sync your cart", { description: cartErrorMessage(err) }),
  })
}
