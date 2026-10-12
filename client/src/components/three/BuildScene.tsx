/**
 * The actual `<Canvas>` tree for `/build`. Default-exported so
 * `BuildCanvasHost.tsx` can `React.lazy()`-import this module specifically
 * - everything that pulls in `three` / `@react-three/fiber` /
 * `@react-three/drei` lives in this file (or things it imports), nothing
 * else. Never import this module eagerly/statically from anywhere outside
 * `BuildCanvasHost.tsx`, or the code-split is defeated and three.js ships
 * to every route again.
 *
 * Performance/a11y wiring, all in this one file:
 *
 * 1. **Adaptive quality** - drei `<PerformanceMonitor>` steps a 3-tier
 *    quality ladder up/down: drop DPR first, then shadows. Each tier has a
 *    reserved `postprocessing` flag (always `false` - no postprocessing
 *    pass exists yet) so wiring one in later is a data change, not a
 *    rewrite.
 * 2. **`frameloop="demand"`** - the canvas only renders when something
 *    calls R3F's `invalidate()`. Three sources do that here: drei's
 *    `<OrbitControls>` calls it internally on every drag/damping-decay
 *    `change` event (no `frameloop="always"` escape hatch needed for smooth
 *    dragging, despite `enableDamping`), this component's
 *    `<IntersectionObserver>` effect (resume on scroll-into-view), and
 *    `CameraRig` re-requesting frames every tick of its own fly-to until it
 *    settles. Net effect: zero rendering while idle or offscreen, smooth
 *    rendering during any actual interaction/animation.
 * 3. **Reduced motion** - `useReducedMotion()` (the JS-readable twin of
 *    this project's existing `motion-reduce:` Tailwind pattern) feeds
 *    `CameraRig`, which cuts instead of tweens when set. `<OrbitControls>`
 *    here has no `autoRotate` to disable.
 * 4. **A11y** - the wrapping `<div>` carries `role="img"` + `aria-label` so
 *    screen readers get one atomic, named region. The bare `<canvas>` R3F
 *    mounts has no `tabIndex` and `<OrbitControls keyEvents>` is left at
 *    its default `false`, so nothing here enters the tab order or can trap
 *    focus.
 */
import { OrbitControls, PerformanceMonitor } from "@react-three/drei"
import { Canvas } from "@react-three/fiber"
import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "@/lib/useReducedMotion"
import type { KeyDef } from "@/lib/catalog/layouts"
import { CAMERA_PRESETS, CameraRig, type CameraPresetId } from "./CameraRig"
import { Keyboard } from "./Keyboard"
import { Lights } from "./Lights"

const DEFAULT_PRESET = CAMERA_PRESETS.angled

interface QualityTier {
  dpr: number | [number, number]
  shadows: boolean
  /**
   * Reserved seam for a future "drop postprocessing" quality lever. No
   * postprocessing pass exists yet, so this is always `false` and nothing
   * reads it - when a pass exists, wire
   * `<EffectComposer enabled={tier.postprocessing}>` and flip this on in
   * the `HIGH`/`MID` tiers below. Adding that is a data change to this
   * array, not new plumbing.
   */
  postprocessing: boolean
}

// Index 0 = best quality. PerformanceMonitor steps up/down by one index at a
// time: first decline drops DPR (index 1), a second sustained decline drops
// shadows too (index 2).
const QUALITY_TIERS: readonly QualityTier[] = [
  { dpr: [1, 2], shadows: true, postprocessing: false }, // high
  { dpr: 1, shadows: true, postprocessing: false }, // mid - DPR capped to 1
  { dpr: 1, shadows: false, postprocessing: false }, // low - shadows also off
]
const LOWEST_TIER_INDEX = QUALITY_TIERS.length - 1
// Non-null: QUALITY_TIERS is a fixed non-empty literal, index 0 always exists.
const DEFAULT_QUALITY_TIER = QUALITY_TIERS[0]!

export interface BuildSceneProps {
  /** Active layout's key list. */
  layoutKeys: KeyDef[]
  /** Display name for the aria-label, e.g. "65%" (see `LAYOUT_LABELS` in `@shared`). */
  layoutLabel: string
  /** Threaded straight through to `<Keyboard>`. Unset falls back to its defaults. */
  caseColorHex?: string
  caseRoughness?: number
  caseMetalness?: number
  /** Which `CAMERA_PRESETS` entry `<CameraRig>` flies to. Defaults to `"angled"`. */
  cameraPreset?: CameraPresetId
}

export default function BuildScene({
  layoutKeys,
  layoutLabel,
  caseColorHex,
  caseRoughness,
  caseMetalness,
  cameraPreset = "angled",
}: BuildSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)
  const [tierIndex, setTierIndex] = useState(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) setInView(entry.isIntersecting)
      },
      { threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const quality = QUALITY_TIERS[tierIndex] ?? DEFAULT_QUALITY_TIER

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Interactive 3D preview of a CLACKFORGE ${layoutLabel} keyboard. Drag to rotate, scroll to zoom.`}
      className="h-full w-full"
    >
      <Canvas
        flat
        frameloop="demand"
        dpr={quality.dpr}
        shadows={quality.shadows}
        camera={{ position: DEFAULT_PRESET.position, fov: DEFAULT_PRESET.fov }}
      >
        <PerformanceMonitor
          onDecline={() => setTierIndex((i) => Math.min(i + 1, LOWEST_TIER_INDEX))}
          onIncline={() => setTierIndex((i) => Math.max(i - 1, 0))}
          onFallback={() => setTierIndex(LOWEST_TIER_INDEX)}
        />
        <Lights />
        <Keyboard
          layout={layoutKeys}
          caseColorHex={caseColorHex}
          caseRoughness={caseRoughness}
          caseMetalness={caseMetalness}
        />
        <CameraRig preset={cameraPreset} reducedMotion={reducedMotion} active={inView} />
        {/* Target follows the active preset (`close-up`'s target isn't the origin like the others)
            so post-settle drag-orbiting pivots around what's actually on screen instead of snapping
            back to board-center. Known minor seam: this snaps immediately while `CameraRig`'s
            position/fov are still lerping mid-transition - a visual-polish follow-up, not a bug. */}
        <OrbitControls makeDefault target={CAMERA_PRESETS[cameraPreset].target} minDistance={4} maxDistance={16} />
      </Canvas>
    </div>
  )
}
