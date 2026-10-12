import { useEffect, useState } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

/**
 * Reads the user's OS-level reduced-motion preference as a plain boolean,
 * staying in sync if it changes mid-session (toggled in OS settings while
 * the tab is open).
 *
 * This project's existing reduced-motion handling (`components/ui/skeleton.tsx`,
 * `components/ui/progress.tsx`) is pure CSS via Tailwind's `motion-reduce:`
 * variant - fine for CSS animations, but useless for three.js/R3F's
 * imperative `useFrame` loops (`components/three/CameraRig.tsx`'s damped
 * fly-to), which need the preference as a JS value at render/animation
 * time. This hook reads the exact same media query Tailwind's
 * `motion-reduce:` compiles to - it is the same mechanism, just exposed to
 * JS, not a new one.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setReduced(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return reduced
}
