import { useEffect, useState } from "react"

/** Tailwind v4's default `sm` breakpoint (640px) - this project has no custom `--breakpoint-*` override (checked `index.css`), so this mirrors the same cutoff every `sm:` class in the codebase already uses. */
const QUERY = "(max-width: 639px)"

/**
 * Reads "below the `sm` breakpoint" as a plain boolean, staying in sync on
 * resize/rotate - same shape as `useReducedMotion.ts` (matchMedia + a
 * `change` listener), reused here for the hero's mobile "lower geometry
 * detail" rule (PROJECT_SPECS.md §4.1: "On mobile: ... lower geometry
 * detail") since this project had no existing mobile-viewport hook to reuse
 * (checked `src/lib` and `src/features` first).
 */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
