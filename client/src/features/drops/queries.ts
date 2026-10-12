import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReserveDropInput } from "@shared"
import { ApiRequestError, fetchDropState, releaseDropReservationRequest, reserveDropRequest } from "@/lib/api"
import { cartKeys } from "@/features/cart/serverCart"

export const dropKeys = {
  detail: (slug: string) => ["drops", "detail", slug] as const,
}

/**
 * `refetchInterval: 3000` is the "realtime stock across browsers" mechanism
 * for this feature (PROJECT_SPECS.md §4.5) - this project has no WebSocket
 * server for drops specifically, and a 3s poll on one small JSON response is
 * simple/cheap enough for a portfolio demo's traffic (RULES.md: "keep it
 * simple, no extra broker unless the project already has one" - this
 * project's only broker-free real-time precedent, see the hero's audio
 * synth, is client-local; there's no existing drops-relevant WS server to
 * reuse). `refetchIntervalInBackground: false` stops polling a backgrounded
 * tab - no point burning requests on a page nobody's looking at, and it
 * avoids every open tab racing the SAME user's own reserve click against
 * itself.
 */
export function useDropState(slug: string | undefined) {
  return useQuery({
    queryKey: dropKeys.detail(slug ?? ""),
    queryFn: () => fetchDropState(slug ?? ""),
    enabled: slug !== undefined && slug.length > 0,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      // Don't retry a real 404 - same reasoning as useProduct/the
      // configurator's saved-build fetch: retrying "this slug doesn't
      // exist" just delays showing the not-found state for no benefit.
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

/**
 * On success, invalidates BOTH this drop's own query (to pick up the new
 * availableStock immediately, not wait up to 3s for the next poll) AND the
 * cart query (cartKeys.root, from features/cart/serverCart.ts) - the reserve
 * route creates a real CartItem server-side, so the header's cart badge/
 * sheet must reflect it right away too, not just on this page.
 */
export function useReserveDropMutation(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ReserveDropInput) => reserveDropRequest(slug, input),
    onSuccess: (data) => {
      queryClient.setQueryData(cartKeys.root, { cart: data.cart })
      void queryClient.invalidateQueries({ queryKey: dropKeys.detail(slug) })
    },
  })
}

export function useReleaseDropReservationMutation(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => releaseDropReservationRequest(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dropKeys.detail(slug) })
      void queryClient.invalidateQueries({ queryKey: cartKeys.root })
    },
  })
}
