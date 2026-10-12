import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CreateCustomBuildInput, RenameSavedBuildInput } from "@shared"
import {
  ApiRequestError,
  createBuildRequest,
  deleteSavedBuildRequest,
  fetchBuildById,
  fetchSavedBuilds,
  renameSavedBuildRequest,
} from "@/lib/api"

/**
 * DB-backed saved builds / share-by-id. Stable query key factory, same
 * pattern as `features/orders/queries.ts` / `features/catalog/queries.ts`
 * - keeps every call site's invalidation target in sync instead of
 * hand-rolling key arrays per file.
 */
export const buildKeys = {
  saved: ["builds", "saved"] as const,
  detail: (id: string) => ["builds", "detail", id] as const,
}

/** `GET /api/builds` - Account page list. Auth required; gated by `<ProtectedRoute>` at the route level, not here. */
export function useSavedBuilds() {
  return useQuery({
    queryKey: buildKeys.saved,
    queryFn: fetchSavedBuilds,
  })
}

/**
 * `GET /api/builds/:id` - public, no auth. Backs `/b/:id` (BuildShare.tsx)
 * and the Account list's "open" link. Doesn't retry a real 404 - same
 * reasoning as `useProduct`/`useOrder`: retrying "this id doesn't exist"
 * only delays showing the not-found state.
 */
export function useBuildDetail(id: string | undefined) {
  return useQuery({
    queryKey: buildKeys.detail(id ?? ""),
    queryFn: () => fetchBuildById(id ?? ""),
    enabled: Boolean(id),
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 404) return false
      return failureCount < 2
    },
  })
}

/**
 * `POST /api/builds` - mints a shareable `CustomBuild`, optionally also
 * saving it (when `label` is set). Only invalidates the Account list's
 * cache when a `SavedBuild` was actually created (`savedBuild !== null`) -
 * a label-less mint-without-save call never touches that list.
 */
export function useCreateBuildMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCustomBuildInput) => createBuildRequest(input),
    onSuccess: (data) => {
      if (data.savedBuild) {
        queryClient.invalidateQueries({ queryKey: buildKeys.saved })
      }
    },
  })
}

/** `PATCH /api/builds/:id` - rename, Account page only. */
export function useRenameSavedBuildMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RenameSavedBuildInput }) => renameSavedBuildRequest(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: buildKeys.saved })
    },
  })
}

/** `DELETE /api/builds/:id` - Account page only. */
export function useDeleteSavedBuildMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSavedBuildRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: buildKeys.saved })
    },
  })
}
