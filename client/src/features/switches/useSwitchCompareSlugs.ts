import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * URL-synced slug state for `/switches/compare` - same URL-state
 * philosophy as the configurator's `?b=` (`features/configurator/urlCodec.ts`)
 * and the shop's filter params (`features/catalog/useShopFilters.ts`): the
 * compare set is shareable and survives a refresh, synced via
 * `useSearchParams` rather than local state.
 *
 * Format is deliberately simple - comma-joined slugs, no base64/versioning
 * like the configurator's codec needs. There's no schema to evolve here
 * (just a flat list of up to 3 already-url-safe kebab-case strings), so the
 * extra machinery that codec carries would be pure overhead.
 */
export const MAX_COMPARE_SWITCHES = 3
const SLUGS_PARAM = "slugs"

function parseSlugs(raw: string | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const token of raw.split(",")) {
    const slug = token.trim()
    if (slug === "" || seen.has(slug)) continue
    seen.add(slug)
    result.push(slug)
    if (result.length === MAX_COMPARE_SWITCHES) break
  }
  return result
}

export interface UseSwitchCompareSlugsResult {
  /** 0-3 deduped, trimmed slugs, in URL order. */
  slugs: string[]
  /**
   * Fixed-length 3-tuple view of `slugs`, padded with `undefined` - lets
   * callers call a fetch hook (`useProduct`) exactly 3 times, unconditionally,
   * at fixed call sites, honoring the rules of hooks instead of calling a
   * hook a variable number of times.
   */
  slots: readonly [string | undefined, string | undefined, string | undefined]
  setSlugs: (next: string[]) => void
  addSlug: (slug: string) => void
  removeSlug: (slug: string) => void
}

export function useSwitchCompareSlugs(): UseSwitchCompareSlugsResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const slugs = useMemo(() => parseSlugs(searchParams.get(SLUGS_PARAM)), [searchParams])

  const writeSlugs = useCallback(
    (next: string[]) => {
      const deduped = parseSlugs(next.join(","))
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (deduped.length === 0) nextParams.delete(SLUGS_PARAM)
          else nextParams.set(SLUGS_PARAM, deduped.join(","))
          return nextParams
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const addSlug = useCallback(
    (slug: string) => {
      if (slugs.includes(slug) || slugs.length >= MAX_COMPARE_SWITCHES) return
      writeSlugs([...slugs, slug])
    },
    [slugs, writeSlugs],
  )

  const removeSlug = useCallback(
    (slug: string) => {
      writeSlugs(slugs.filter((s) => s !== slug))
    },
    [slugs, writeSlugs],
  )

  const slots = useMemo(
    () => [slugs[0], slugs[1], slugs[2]] as const,
    [slugs],
  )

  return { slugs, slots, setSlugs: writeSlugs, addSlug, removeSlug }
}
