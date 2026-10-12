import { useEffect, useMemo, useState } from "react"

/**
 * Clock-skew-corrected countdown to `targetIso` (e.g. a drop's `openAt`/
 * `closeAt`, or a held reservation's `expiresAt`). `serverNowIso` MUST come
 * from the server's own response (`DropStateResponseSchema.serverNow`) -
 * NEVER the client's local `Date.now()` as the baseline - per that field's
 * doc comment in shared/src/groupBuyDrop.ts: a visitor with a skewed system
 * clock would otherwise see a materially wrong countdown. The skew offset
 * (client clock minus server clock, at the moment `serverNowIso` was
 * fetched) is recomputed every time a fresh `serverNowIso` lands (i.e. every
 * 3s poll via useDropState) and held constant between polls, while the
 * displayed number still ticks down locally every second - no network
 * round-trip needed for the per-second tick itself.
 */
export function useCountdown(targetIso: string, serverNowIso: string): number {
  const targetMs = useMemo(() => new Date(targetIso).getTime(), [targetIso])
  const skewMs = useMemo(() => Date.now() - new Date(serverNowIso).getTime(), [serverNowIso])

  const computeRemaining = () => Math.max(0, targetMs - (Date.now() - skewMs))
  const [remainingMs, setRemainingMs] = useState(computeRemaining)

  useEffect(() => {
    setRemainingMs(computeRemaining())
    const id = setInterval(() => setRemainingMs(computeRemaining()), 1000)
    return () => clearInterval(id)
    // computeRemaining is intentionally re-created each render (closes over
    // targetMs/skewMs) - re-arming only off the two values that actually
    // change its result, not a function-identity dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs, skewMs])

  return remainingMs
}

/** `172800000` -> `"2d 0h 0m"`. Drops the largest unit once it hits zero (never shows "0d"), always shows at least seconds once under a minute. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00"

  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
