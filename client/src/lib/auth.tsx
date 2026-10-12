import type { ReactNode } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AuthUser } from "@shared"
import { fetchMe, loginRequest, logoutRequest, registerRequest, tryAsAdminRequest } from "@/lib/api"

/**
 * `GET /api/auth/me` is the single source of truth for "is anyone logged
 * in" - `fetchMe` resolves a 401 to `null` (an expected result, not an
 * error), so this cache entry is always either `AuthResponse` (signed in)
 * or `null` (signed out), never an error state the UI has to special-case.
 */
export const authKeys = {
  me: ["auth", "me"] as const,
}

function useMeQuery() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe,
    // A real network/server failure here is rare in dev/CI and retrying it
    // only delays `isLoading` resolving; fail fast and let the UI fall back
    // to "signed out" rather than hang on a spinner.
    retry: false,
    staleTime: 60_000,
  })
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  /** True only until the FIRST `/me` response lands - never flashes "signed out" before that. */
  isLoading: boolean
}

export function useAuth(): AuthState {
  const { data, isPending } = useMeQuery()
  const user = data?.user ?? null
  return { user, isAuthenticated: user !== null, isLoading: isPending }
}

/** Register also establishes a session (locked contract) - same cache seed as login. */
export function useRegisterMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: registerRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me, data)
    },
  })
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me, data)
    },
  })
}

/**
 * "Try as admin" demo mode (`About.tsx`'s only caller). Same cache-seed
 * convention as `useLoginMutation`, plus a navigate straight to
 * `/admin/dashboard` on success rather than bare `/admin`, which would just
 * redirect there anyway via the index route - one less render for no
 * benefit otherwise.
 */
export function useTryAsAdminMutation() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: tryAsAdminRequest,
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me, data)
      navigate("/admin/dashboard")
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      // 204 has no body - nothing to seed the cache WITH, just clear it.
      // The server never redirects on logout (contract); that's the caller's job.
      queryClient.setQueryData(authKeys.me, null)
    },
  })
}

interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * Gates `children` behind `useAuth()`. Preserves the attempted destination
 * in router state so `/login` can send the user back after a successful
 * sign-in instead of always landing on `/account`.
 *
 * Loading div is `min-h-[100svh]` (not a smaller box) on purpose - a CLS
 * fix, see `routes/RouteFallback.tsx`'s doc comment for the measured
 * before/after. Keep this in sync with `AdminRoute`'s identical div below
 * and with `RouteFallback` itself.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

interface AdminRouteProps {
  children: ReactNode
}

/**
 * Gates admin screens. Same shape as `ProtectedRoute` above with one extra
 * branch: logged-out -> `/login` (preserving `from`, same as
 * `ProtectedRoute`); logged-in but not an admin -> `/account`, no dead-end
 * 403 page needed - a customer landing on `/admin/*` just bounces to their
 * own account, not an error state.
 */
export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (user?.role !== "admin") {
    return <Navigate to="/account" replace />
  }

  return <>{children}</>
}
