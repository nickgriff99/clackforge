/**
 * Generic explodable-layer wrapper - generalizes `SwitchDetailScene.tsx`'s
 * per-MESH damped-lerp-toward-target-Y pattern to a per-GROUP wrapper, so the
 * hero's 5 layers (keycaps/switches/plate/pcb/case, PROJECT_SPECS.md §4.1)
 * can each be an arbitrary subtree (instanced keycaps, a single case mesh,
 * etc.) instead of one mesh. `targetY = baseY + explodeOffsetY * explodeFactor`
 * - same formula shape as `SwitchDetailScene.tsx`'s `BASE_Y[part.id] +
 * part.explodeOffsetY * explodeFactor`, extended from 4 parts to 5 layers.
 *
 * `explodeFactor` is read via `MotionValue.get()` every `useFrame` tick
 * instead of being a React prop - Framer Motion's `useScroll`/`useTransform`
 * (driven by `HeroSection.tsx`) update many times per scroll frame, and a
 * MotionValue lets this component poll the latest value imperatively with
 * zero React re-renders per frame (the whole point of `useFrame` + refs).
 * See `HeroScene.tsx`'s doc comment for the full scroll-wiring rationale.
 */
import { useFrame } from "@react-three/fiber"
import type { MotionValue } from "framer-motion"
import { useRef, type ReactNode } from "react"
import * as THREE from "three"

/** Same ease-rate family as `CameraRig.tsx`/`SwitchDetailScene.tsx`. */
const EASE_SPEED = 8

export interface ExplodeLayerProps {
  /** Assembled (explodeFactor === 0) Y position. */
  baseY: number
  /** World units this layer travels at full explode (explodeFactor === 1). */
  explodeOffsetY: number
  explodeFactor: MotionValue<number>
  reducedMotion: boolean
  children: ReactNode
}

export function ExplodeLayer({ baseY, explodeOffsetY, explodeFactor, reducedMotion, children }: ExplodeLayerProps) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const targetY = baseY + explodeOffsetY * explodeFactor.get()
    if (reducedMotion) {
      group.position.y = targetY
      return
    }
    const alpha = 1 - Math.exp(-EASE_SPEED * delta)
    group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, alpha)
  })

  return <group ref={groupRef}>{children}</group>
}
