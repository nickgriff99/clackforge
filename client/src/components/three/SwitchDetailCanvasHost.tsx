/**
 * Integration seam between `routes/SwitchDetail.tsx` and the real 3D
 * scene - exact same shape as `BuildCanvasHost.tsx`. This file must not
 * import `three`, `@react-three/fiber`, or `@react-three/drei` - directly
 * or transitively - or `React.lazy()` below stops code-splitting, since
 * Vite would have to eagerly evaluate this module (and therefore its
 * imports) to render the route. `SwitchDetailScene.tsx` is the only thing
 * that may pull those packages in.
 *
 * Decision order, cheapest check first (identical to `BuildCanvasHost.tsx`):
 * 1. `isWebGLAvailable()` - synchronous, no network cost. WebGL unusable ->
 *    permanent `state="poster"`, never request the three.js chunk.
 * 2. Otherwise `React.lazy()`-import `SwitchDetailScene` behind
 *    `<Suspense fallback={<ModelViewport state="skeleton" />}>`.
 *
 * The press button and explode slider both live in `routes/SwitchDetail.tsx`,
 * outside this component - by design. The press button must keep working
 * (sound still plays) even when WebGL is unavailable and this host is
 * permanently rendering the poster; it has no dependency on the 3D scene
 * actually existing. `explodeFactor`/`pressed` are threaded through as
 * plain data props here and simply go unused by the poster/skeleton
 * branches.
 */
import { lazy, Suspense, useState } from "react"
import { ModelViewport } from "@/components/layout/ModelViewport"
import { isWebGLAvailable } from "@/lib/webgl"
// Type-only import - erased at compile time, does not pull `three` in.
import type { SwitchExplodedPart } from "@shared"

const SwitchDetailScene = lazy(() => import("./SwitchDetailScene"))

export interface SwitchDetailCanvasHostProps {
  parts: SwitchExplodedPart[]
  explodeFactor: number
  pressed: boolean
  ariaLabel: string
}

export function SwitchDetailCanvasHost({ parts, explodeFactor, pressed, ariaLabel }: SwitchDetailCanvasHostProps) {
  const [webglAvailable] = useState(isWebGLAvailable)

  if (!webglAvailable) {
    return <ModelViewport state="poster" />
  }

  return (
    <Suspense fallback={<ModelViewport state="skeleton" />}>
      <SwitchDetailScene parts={parts} explodeFactor={explodeFactor} pressed={pressed} ariaLabel={ariaLabel} />
    </Suspense>
  )
}
