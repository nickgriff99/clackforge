import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth"
import { useGuestCartStore } from "./guestStore"
import { useMergeCartMutation } from "./serverCart"

/**
 * Spec §5 Cart / §9 E2E case 4: "guest cart → log in → cart merges
 * correctly." Mounted once at the root (`RootLayout`), not per-page, so it
 * fires no matter which route the user is on when `useAuth()` flips from
 * signed-out to signed-in - covers all three sign-in paths with ONE hook:
 * the login mutation, the register mutation, AND a Google OAuth redirect
 * landing back on `/account` (that round-trip is a full-page browser
 * redirect, not a React mutation callback - this effect is the only place
 * that can observe "we just became authenticated" for that path).
 *
 * `mergedRef` guards against re-merging on every render while signed in
 * (TanStack Query re-renders this on every cart/auth cache update) and
 * resets on sign-out so the NEXT sign-in merges again.
 */
export function useCartMergeOnSignIn(): void {
  const { isAuthenticated, isLoading } = useAuth()
  const items = useGuestCartStore((s) => s.items)
  const clear = useGuestCartStore((s) => s.clear)
  const mergeMutation = useMergeCartMutation()
  const mergedRef = useRef(false)

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      mergedRef.current = false
      return
    }

    if (mergedRef.current) return
    mergedRef.current = true

    if (items.length === 0) return

    mergeMutation.mutate(
      { items },
      {
        onSuccess: () => clear(),
      },
    )
    // Intentionally only re-runs on isAuthenticated/isLoading transitions -
    // `items`/`clear`/`mergeMutation` are read fresh via closure each time
    // the effect actually fires, not on every guest-cart edit or every
    // re-render the mutation object identity causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading])
}
