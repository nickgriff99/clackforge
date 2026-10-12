/**
 * Named camera presets (top, angled, side profile, close-up on a key,
 * with smooth transitions).
 *
 * `close-up`'s target is a fixed point near where a top-row key sits on a
 * centered board, not derived from the active layout's real geometry -
 * `CameraRig` has no layout/key-position input today, and threading one
 * in just to aim at one specific key would be more plumbing than it's
 * worth for a sensible fixed close-in position. A real "fly to this key"
 * (e.g. tied to a future per-key accent customization step) is a good
 * follow-up once that step exists - tracked here, not silently assumed
 * solved.
 *
 * Deliberately not using drei's `<CameraControls>`: the call site
 * (`routes/Build.tsx`) already mounts drei `<OrbitControls>` for live
 * user rotate/zoom, and two camera-owning control schemes fighting over
 * the same transform every frame is worse than either alone. Instead
 * this is a plain `useFrame` damped lerp toward the preset's
 * position/target/fov that marks itself "settled" once it arrives and
 * stops writing to the camera - handing full control back to
 * OrbitControls (whose `target` the call site should set to the same
 * preset's `target`). No extra dependency, no frame-fight.
 *
 * Two further behaviors layered on top:
 * - `reducedMotion`: camera tweens become cuts under
 *   `prefers-reduced-motion`. When true, a preset change snaps the camera
 *   straight to its final position/target/fov in one frame instead of
 *   lerping.
 * - `active`: the `frameloop="demand"` wiring (see `BuildScene.tsx`).
 *   Demand mode only renders a frame when something calls R3F's
 *   `invalidate()`, so a multi-frame lerp has to keep re-requesting
 *   frames itself every tick until it settles - `invalidate()` calls
 *   below do that. `active` (driven by an `IntersectionObserver` on the
 *   canvas) lets the call site freeze that re-requesting while the canvas
 *   is scrolled offscreen, instead of quietly spending frames animating a
 *   camera nobody can see.
 */
import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import * as THREE from "three"

export type CameraPresetId = "angled" | "top" | "side" | "close-up"

export interface CameraPreset {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  angled: { position: [6, 5.5, 7], target: [0, 0, 0], fov: 42 },
  top: { position: [0, 10, 0.01], target: [0, 0, 0], fov: 42 },
  // Side profile - same distance/height family as `angled`, rotated ~90°
  // around Y so the board's silhouette (case height/thickness, the actual
  // point of a "side profile" view) reads clearly instead of foreshortened.
  side: { position: [9.5, 3, 0], target: [0, 0, 0], fov: 42 },
  // Close-up on a key - narrow FOV, aimed at a fixed point near the
  // top-left of a centered board (roughly where a top-row function key
  // sits). Distance from position to target is kept just above
  // `BuildScene.tsx`'s `<OrbitControls minDistance={4}>` on purpose - any
  // closer and OrbitControls' own per-frame clamp would fight this preset's
  // settled position the moment the user so much as scrolls. See this
  // file's doc comment above for why the target isn't geometry-derived yet.
  "close-up": { position: [-2.0, 2.0, 2.8], target: [-2.6, 0.3, -1.4], fov: 22 },
}

export interface CameraRigProps {
  preset: CameraPresetId
  /** Ease rate toward the preset - higher settles faster. Default 4. */
  speed?: number
  /** Snap to the preset instead of animating (reduced motion). Default `false`. */
  reducedMotion?: boolean
  /**
   * Whether this rig should keep animating/requesting frames right now.
   * Set to `false` while the canvas is scrolled offscreen under
   * `frameloop="demand"` to stop re-invalidating for an invisible canvas;
   * flipping back to `true` resumes an in-flight fly-to. Default `true` so
   * existing/other call sites behave exactly as before.
   */
  active?: boolean
}

const SETTLE_EPSILON = 0.01

export function CameraRig({ preset, speed = 4, reducedMotion = false, active = true }: CameraRigProps) {
  const { camera, invalidate } = useThree()
  const settledRef = useRef(false)
  const activePresetRef = useRef<CameraPresetId | null>(null)
  const scratchTarget = useRef(new THREE.Vector3())

  useEffect(() => {
    if (activePresetRef.current !== preset) {
      activePresetRef.current = preset
      settledRef.current = false

      if (reducedMotion) {
        // Cut instead of tween: land on the preset in this one frame.
        const { position, target, fov } = CAMERA_PRESETS[preset]
        camera.position.set(...position)
        camera.lookAt(target[0], target[1], target[2])
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = fov
          camera.updateProjectionMatrix()
        }
        settledRef.current = true
        invalidate()
      }
    }
  }, [preset, reducedMotion, camera, invalidate])

  // Demand-mode resume: if a lerp was interrupted mid-flight while offscreen
  // (`active` went false then true again), kick one frame to restart the
  // self-sustaining invalidate() chain in the loop below.
  useEffect(() => {
    if (active && !settledRef.current) invalidate()
  }, [active, invalidate])

  useFrame((_, delta) => {
    if (settledRef.current || !active) return

    const { position, target, fov } = CAMERA_PRESETS[preset]
    scratchTarget.current.set(...position)
    const alpha = 1 - Math.exp(-speed * delta)

    camera.position.lerp(scratchTarget.current, alpha)
    camera.lookAt(target[0], target[1], target[2])

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, fov, alpha)
      camera.updateProjectionMatrix()
    }

    if (camera.position.distanceTo(scratchTarget.current) < SETTLE_EPSILON) {
      settledRef.current = true
    } else {
      // frameloop="demand" (BuildScene.tsx) only renders a frame when
      // something calls invalidate() - keep requesting them until settled.
      invalidate()
    }
  })

  return null
}
