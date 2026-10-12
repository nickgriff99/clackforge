/**
 * Integration seam between `features/hero/HeroSection.tsx` and the real hero
 * 3D scene (PROJECT_SPECS.md §4.6 performance budget) - mirrors
 * `BuildCanvasHost.tsx`'s exact shape (same decision order: synchronous
 * `isWebGLAvailable()` check first, permanent `state="poster"` if it fails;
 * otherwise `React.lazy()` + `<Suspense fallback={state="skeleton"}>`). This
 * file must NOT import `three`, `@react-three/fiber`, or `@react-three/drei`
 * - directly or transitively - or the lazy-chunk code-split is defeated (see
 * `BuildCanvasHost.tsx`'s doc comment for the full rationale, identical
 * here). The `MotionValue` import below is type-only - erased at compile
 * time, safe.
 *
 * Goes through `<ModelViewport>` exactly like `BuildCanvasHost.tsx`'s
 * skeleton/poster branches do (consistent CLS-safe sizing, reused
 * `<KeyboardPoster>`/`<ModelViewportSkeleton>` art) - `HeroSection.tsx`
 * decides how much of the sticky hero panel this box occupies; this
 * component only owns the webgl-detect/lazy-load state machine.
 */
import { lazy, Suspense, useState } from "react"
import type { MotionValue } from "framer-motion"
import { ModelViewport } from "@/components/layout/ModelViewport"
import { isWebGLAvailable } from "@/lib/webgl"
// Type-only import - erased at compile time, does NOT pull `three`/R3F/drei
// into this module (see this file's own doc comment on why that matters).
import type { KeyDef } from "@/lib/catalog/layouts"

const HeroScene = lazy(() => import("./HeroScene"))

export interface HeroCanvasHostProps {
  layoutKeys: KeyDef[]
  explodeFactor: MotionValue<number>
  pressedKeyId: string | null
  reducedMotion: boolean
  isMobile: boolean
  active: boolean
  onPress: (id: string) => void
  onRelease: () => void
  ariaLabel: string
}

export function HeroCanvasHost({
  layoutKeys,
  explodeFactor,
  pressedKeyId,
  reducedMotion,
  isMobile,
  active,
  onPress,
  onRelease,
  ariaLabel,
}: HeroCanvasHostProps) {
  const [webglAvailable] = useState(isWebGLAvailable)

  if (!webglAvailable) {
    return <ModelViewport state="poster" />
  }

  return (
    <Suspense fallback={<ModelViewport state="skeleton" />}>
      <HeroScene
        layoutKeys={layoutKeys}
        explodeFactor={explodeFactor}
        pressedKeyId={pressedKeyId}
        reducedMotion={reducedMotion}
        isMobile={isMobile}
        active={active}
        onPress={onPress}
        onRelease={onRelease}
        ariaLabel={ariaLabel}
      />
    </Suspense>
  )
}
