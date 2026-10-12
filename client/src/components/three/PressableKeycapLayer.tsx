/**
 * Hero-only instanced keycap layer with a single pressable instance
 * (PROJECT_SPECS.md §4.1: "the matching 3D key presses down" + mobile
 * "tap keys to press them"). Deliberately NOT a reuse/extension of
 * `Keycap.tsx` - same reasoning `SwitchDetailScene.tsx` gives for not reusing
 * `Switch.tsx`: `Keycap.tsx` is shared with the live `/build` configurator,
 * and this component needs a genuinely different capability (per-instance
 * imperative press animation + per-instance pointer events for mobile tap)
 * that `Keycap.tsx` has no reason to carry. Mirrors `Keycap.tsx`'s geometry
 * constants (`KEYCAP_HEIGHT`/`KEYCAP_LIFT`/`KEYCAP_INSET`) by value, not
 * import, since that file doesn't export them - if the configurator's keycap
 * proportions change, check this file too.
 *
 * Per-instance press: drei's `<Instance>` forwards a ref to a `PositionMesh`
 * (a `THREE.Group` subclass) whose `position` can be mutated imperatively in
 * `useFrame` - same damped-lerp-toward-target idiom as `ExplodeLayer.tsx`/
 * `SwitchDetailScene.tsx`, just applied per-instance instead of per-group.
 * `PositionMesh` also supports pointer events directly (drei overrides its
 * `raycast()` to resolve to the correct instance) - so mobile tap-to-press
 * is REAL per-key raycasting via `onPointerDown`, not an approximation.
 */
import { Instance, Instances } from "@react-three/drei"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"
import type { KeyDef } from "@/lib/catalog/layouts"
import { layoutToWorld } from "./layoutGeometry"
import { materials } from "./materials"

const KEYCAP_HEIGHT = 0.5
const KEYCAP_LIFT = 0.35
const KEYCAP_INSET = 0.92
/** How far a pressed keycap sinks, in world units - same family as `SwitchDetailScene.tsx`'s `PRESS_TRAVEL_Y`. */
const PRESS_TRAVEL_Y = 0.12
const EASE_SPEED = 14

const KEYCAP_GEOMETRY = new THREE.BoxGeometry(1, KEYCAP_HEIGHT, 1)

interface PressableInstanceProps {
  keyDef: KeyDef
  center: [number, number]
  pressed: boolean
  reducedMotion: boolean
  onPress: (id: string) => void
  onRelease: () => void
}

function PressableInstance({ keyDef, center, pressed, reducedMotion, onPress, onRelease }: PressableInstanceProps) {
  const ref = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    const obj = ref.current
    if (!obj) return
    const targetY = KEYCAP_LIFT - (pressed ? PRESS_TRAVEL_Y : 0)
    if (reducedMotion) {
      obj.position.y = targetY
      return
    }
    const alpha = 1 - Math.exp(-EASE_SPEED * delta)
    obj.position.y = THREE.MathUtils.lerp(obj.position.y, targetY, alpha)
  })

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation()
    onPress(keyDef.id)
  }

  return (
    <Instance
      ref={ref}
      position={[center[0], KEYCAP_LIFT, center[1]]}
      scale={[keyDef.width * KEYCAP_INSET, 1, keyDef.height * KEYCAP_INSET]}
      onPointerDown={handlePointerDown}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
    />
  )
}

export interface PressableKeycapLayerProps {
  keys: KeyDef[]
  /** `KeyDef.id` (a `KeyboardEvent.code` value) of the currently-pressed key, or `null`. */
  pressedKeyId: string | null
  reducedMotion: boolean
  /** Mobile tap-to-press - shares the exact same pressed-key state as physical keyboard input (`HeroSection.tsx` owns it). */
  onPress: (id: string) => void
  onRelease: () => void
}

export function PressableKeycapLayer({ keys, pressedKeyId, reducedMotion, onPress, onRelease }: PressableKeycapLayerProps) {
  const transforms = useMemo(() => layoutToWorld(keys), [keys])

  return (
    <Instances limit={Math.max(transforms.length, 1)} geometry={KEYCAP_GEOMETRY} material={materials.keycap}>
      {transforms.map(({ key, center }) => (
        <PressableInstance
          key={key.id}
          keyDef={key}
          center={center}
          pressed={key.id === pressedKeyId}
          reducedMotion={reducedMotion}
          onPress={onPress}
          onRelease={onRelease}
        />
      ))}
    </Instances>
  )
}
