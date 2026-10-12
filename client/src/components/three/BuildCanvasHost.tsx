/**
 * Integration seam between `routes/Build.tsx` and the real 3D scene. This
 * file must not import `three`, `@react-three/fiber`, or
 * `@react-three/drei` - directly or transitively - or `React.lazy()`
 * below stops code-splitting anything, since Vite would have to eagerly
 * evaluate this module (and therefore its imports) to even render the
 * route. `BuildScene.tsx` is the only thing that may pull those packages
 * in.
 *
 * Decision order, cheapest check first:
 * 1. `isWebGLAvailable()` - synchronous canvas-context probe, no network
 *    cost. If WebGL isn't usable at all, render the permanent static
 *    `state="poster"` and stop: never request the three.js chunk, never
 *    show a spinner that can't resolve.
 * 2. Otherwise, `React.lazy()`-import `BuildScene` behind a `<Suspense>`
 *    whose fallback is `state="skeleton"` - the brief pre-paint loading
 *    state while a chunk is still fetching that `ModelViewport`'s own doc
 *    comment describes. Once the chunk resolves, `BuildScene` renders its
 *    own `state="canvas"` wrapping the live `<Canvas>`.
 *
 * Both branches (and the Suspense fallback) go through `<ModelViewport>`,
 * which always sizes itself the same way regardless of `state` - so
 * swapping skeleton -> canvas, or landing permanently on poster, never
 * shifts layout.
 *
 * WebGL-unavailable users land on the static poster permanently - an
 * honest placeholder, not an interactive fallback. True 2D-configurator
 * parity would need its own option-switching UI and is a known gap, not
 * silently assumed solved.
 *
 * This component takes the live layout/case-material props (see
 * `BuildCanvasHostProps`) rather than rendering a fixed demo layout, and
 * forwards them straight through to `<BuildScene>` - no new `three`-ish
 * imports here, just plain data (string/number/array) props, so the
 * lazy-load boundary above is unaffected.
 *
 * Known fragility: despite this file's doc comment above claiming "both
 * branches... go through `<ModelViewport>`," the actual `state="canvas"`
 * branch (the `<Suspense><BuildScene /></Suspense>` return below) does
 * not wrap its result in `<ModelViewport>` - only the
 * `"poster"`/`"skeleton"` branches do. `BuildScene`'s own `h-full w-full`
 * wrapper div has no intrinsic size without that wrapper; it currently
 * works because of CSS Grid's default `align-items: stretch` at
 * `routes/Build.tsx`'s call site, not because of anything in this file.
 * `routes/Build.tsx` wraps its `<BuildCanvasHost>` call in the same
 * aspect-ratio classes `<ModelViewport>` uses, independent of this
 * fragility, so the live scene is sized correctly regardless - but the
 * real fix (making this component self-contained) is still owed.
 */
import { lazy, Suspense, useState } from "react"
import { ModelViewport } from "@/components/layout/ModelViewport"
import { isWebGLAvailable } from "@/lib/webgl"
// Type-only imports - erased at compile time, do NOT pull `three`/R3F/drei
// into this module or defeat the `React.lazy()` code-split below (see this
// file's own doc comment on why that boundary matters).
import type { KeyDef } from "@/lib/catalog/layouts"
import type { CameraPresetId } from "./CameraRig"

const BuildScene = lazy(() => import("./BuildScene"))

export interface BuildCanvasHostProps {
  /** Active layout's key list. */
  layoutKeys: KeyDef[]
  /** Display name for the aria-label, e.g. "65%". */
  layoutLabel: string
  /** Threaded straight through to `<BuildScene>`/`<Keyboard>`. Unset falls back to their defaults. */
  caseColorHex?: string
  caseRoughness?: number
  caseMetalness?: number
  /** Which `CAMERA_PRESETS` entry the scene flies to. Unset = `BuildScene`'s own `"angled"` default. */
  cameraPreset?: CameraPresetId
}

export function BuildCanvasHost({
  layoutKeys,
  layoutLabel,
  caseColorHex,
  caseRoughness,
  caseMetalness,
  cameraPreset,
}: BuildCanvasHostProps) {
  const [webglAvailable] = useState(isWebGLAvailable)

  if (!webglAvailable) {
    return <ModelViewport state="poster" />
  }

  return (
    <Suspense fallback={<ModelViewport state="skeleton" />}>
      <BuildScene
        layoutKeys={layoutKeys}
        layoutLabel={layoutLabel}
        caseColorHex={caseColorHex}
        caseRoughness={caseRoughness}
        caseMetalness={caseMetalness}
        cameraPreset={cameraPreset}
      />
    </Suspense>
  )
}
