/**
 * The actual `<Canvas>` tree for the home hero. Default-exported so
 * `HeroCanvasHost.tsx` can `React.lazy()`-import this module specifically -
 * same lazy-chunk isolation rule as `BuildScene.tsx`/`SwitchDetailScene.tsx`:
 * everything that pulls in `three`/`@react-three/fiber`/`@react-three/drei`
 * lives in this file (or things it imports), never imported
 * eagerly/statically from anywhere outside `HeroCanvasHost.tsx`.
 *
 * Layer model: 5 `<ExplodeLayer>`-wrapped groups (keycaps, switches, plate,
 * pcb, case - `HERO_LAYERS` in `features/hero/heroLayers.ts` is the single
 * source of truth for ids/copy/offsets). Reuses `Keycap`'s/`Switch`'s/
 * `Case`'s existing component Y-baking (their `<ExplodeLayer baseY>` is 0),
 * `Plate`/`Pcb` for the two layers that need their own geometry, and a
 * hero-only `PressableKeycapLayer` instead of `Keycap` for the one layer
 * that needs per-instance press + tap behavior.
 *
 * No camera rig / OrbitControls: deliberately static camera (reuses
 * `CAMERA_PRESETS.angled`'s position/fov as a one-time value, not mounting
 * `<CameraRig>`). The hero's entire interaction surface is already scroll
 * (explode) + tap/type (press) - adding drag-to-orbit on top would fight
 * mobile's scroll/tap gestures over the same canvas. The configurator's
 * `/build` page is a deliberately different surface (dedicated real
 * estate, no page-scroll competing for the same gesture), so
 * `OrbitControls` makes sense there and not here.
 *
 * Frameloop: `"always"` while `active` (in view), `"never"` while scrolled
 * away - not `BuildScene.tsx`'s `frameloop="demand"` + `invalidate()`
 * pattern. `explodeFactor` is a Framer Motion `MotionValue` polled
 * imperatively via `.get()` inside `ExplodeLayer`'s `useFrame` specifically
 * so scroll updates don't trigger React re-renders - but that also means
 * nothing calls R3F's `invalidate()` when the MotionValue changes, so
 * `"demand"` mode would silently stop rendering mid-scroll. A continuous
 * frameloop while visible is the simpler correct fit for "something
 * external is driving animation every frame regardless of React," and
 * `"never"` while offscreen still pauses rendering when the canvas isn't
 * visible.
 *
 * Mobile geometry: `isMobile` caps `dpr` to a flat `1` (no
 * `<PerformanceMonitor>` tiering - see this file's sibling
 * `SwitchDetailScene.tsx` for the precedent on skipping that machinery for
 * a simpler scene), and `HeroSection.tsx` passes a smaller layout (`"60"`
 * instead of `"65"`) on mobile, which is the real geometry-detail lever
 * here (fewer instanced keycaps/switches) since none of this scene's
 * procedural box/cylinder geometries have a meaningful segment count to
 * reduce.
 */
import { Canvas } from "@react-three/fiber"
import type { MotionValue } from "framer-motion"
import { CAMERA_PRESETS } from "./CameraRig"
import { Case } from "./Case"
import { ExplodeLayer } from "./ExplodeLayer"
import { HERO_LAYER_BASE_Y, HERO_LAYERS } from "@/features/hero/heroLayers"
import type { KeyDef } from "@/lib/catalog/layouts"
import { Lights } from "./Lights"
import { Pcb } from "./Pcb"
import { Plate } from "./Plate"
import { PressableKeycapLayer } from "./PressableKeycapLayer"
import { Switch } from "./Switch"

export interface HeroSceneProps {
  layoutKeys: KeyDef[]
  /** 0 (assembled) to 1 (fully exploded) - see `ExplodeLayer.tsx`'s doc comment for why this is a `MotionValue`, not a plain number prop. */
  explodeFactor: MotionValue<number>
  pressedKeyId: string | null
  reducedMotion: boolean
  isMobile: boolean
  /** In-view gate (IntersectionObserver, `HeroSection.tsx`) - drives `frameloop`, see this file's doc comment. */
  active: boolean
  onPress: (id: string) => void
  onRelease: () => void
  ariaLabel: string
}

export default function HeroScene({
  layoutKeys,
  explodeFactor,
  pressedKeyId,
  reducedMotion,
  isMobile,
  active,
  onPress,
  onRelease,
  ariaLabel,
}: HeroSceneProps) {
  const preset = CAMERA_PRESETS.angled

  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <Canvas
        flat
        frameloop={active ? "always" : "never"}
        dpr={isMobile ? 1 : [1, 2]}
        camera={{ position: preset.position, fov: preset.fov }}
      >
        <Lights />

        <ExplodeLayer
          baseY={HERO_LAYER_BASE_Y.case}
          explodeOffsetY={HERO_LAYERS.case.explodeOffsetY}
          explodeFactor={explodeFactor}
          reducedMotion={reducedMotion}
        >
          <Case keys={layoutKeys} />
        </ExplodeLayer>

        <ExplodeLayer
          baseY={HERO_LAYER_BASE_Y.pcb}
          explodeOffsetY={HERO_LAYERS.pcb.explodeOffsetY}
          explodeFactor={explodeFactor}
          reducedMotion={reducedMotion}
        >
          <Pcb keys={layoutKeys} />
        </ExplodeLayer>

        <ExplodeLayer
          baseY={HERO_LAYER_BASE_Y.plate}
          explodeOffsetY={HERO_LAYERS.plate.explodeOffsetY}
          explodeFactor={explodeFactor}
          reducedMotion={reducedMotion}
        >
          <Plate keys={layoutKeys} />
        </ExplodeLayer>

        <ExplodeLayer baseY={0} explodeOffsetY={HERO_LAYERS.switches.explodeOffsetY} explodeFactor={explodeFactor} reducedMotion={reducedMotion}>
          <Switch keys={layoutKeys} />
        </ExplodeLayer>

        <ExplodeLayer baseY={0} explodeOffsetY={HERO_LAYERS.keycaps.explodeOffsetY} explodeFactor={explodeFactor} reducedMotion={reducedMotion}>
          <PressableKeycapLayer
            keys={layoutKeys}
            pressedKeyId={pressedKeyId}
            reducedMotion={reducedMotion}
            onPress={onPress}
            onRelease={onRelease}
          />
        </ExplodeLayer>
      </Canvas>
    </div>
  )
}
