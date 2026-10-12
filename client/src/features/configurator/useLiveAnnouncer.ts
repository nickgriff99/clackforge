import { useCallback, useRef, useState } from "react"

/**
 * Minimal `aria-live="polite"` announcer - PROJECT_SPECS.md §6: the
 * configurator's required text-alternative for the decorative-plus 3D
 * canvas ("a live region announcing changes like 'Case color changed to
 * Graphite. Total $284'"). `routes/Build.tsx` renders the visually-hidden
 * region this feeds; every option/layout change calls `announce()`.
 *
 * Appends a zero-width marker when the new message is textually identical
 * to the last one, since `aria-live` regions only re-announce on an actual
 * DOM text change - without this, toggling back to an already-announced
 * value would silently stop announcing the second time.
 */
export function useLiveAnnouncer() {
  const [message, setMessage] = useState("")
  const lastRef = useRef("")

  const announce = useCallback((text: string) => {
    const next = text === lastRef.current ? `${text}​` : text
    lastRef.current = text
    setMessage(next)
  }, [])

  return { message, announce }
}
