/**
 * Simple procedural switch: a housing box + a stem cylinder, one pair per
 * key, both instanced (same performance rule as `Keycap`). This is a
 * generic stand-in good enough to sit under a keycap - the exploded-view,
 * spring/stem-detail switch model from spec §4.3 is a much later phase.
 */
import { Instance, Instances } from "@react-three/drei"
import { useMemo } from "react"
import * as THREE from "three"
import type { KeyDef } from "@/lib/catalog/layouts"
import { layoutToWorld } from "./layoutGeometry"
import { materials } from "./materials"

/** Housing footprint is fixed (not scaled by key width) - real switches are a constant size regardless of keycap. */
const HOUSING_SIZE = 0.6
const HOUSING_HEIGHT = 0.35
const HOUSING_Y = 0.08
const STEM_RADIUS = 0.1
const STEM_HEIGHT = 0.22
const STEM_Y = HOUSING_Y + HOUSING_HEIGHT / 2 + STEM_HEIGHT / 2

const HOUSING_GEOMETRY = new THREE.BoxGeometry(HOUSING_SIZE, HOUSING_HEIGHT, HOUSING_SIZE)
const STEM_GEOMETRY = new THREE.CylinderGeometry(STEM_RADIUS, STEM_RADIUS, STEM_HEIGHT, 12)

export interface SwitchProps {
  keys: KeyDef[]
}

export function Switch({ keys }: SwitchProps) {
  const transforms = useMemo(() => layoutToWorld(keys), [keys])
  const count = Math.max(transforms.length, 1)

  return (
    <group>
      <Instances limit={count} geometry={HOUSING_GEOMETRY} material={materials.switchHousing}>
        {transforms.map(({ key, center }) => (
          <Instance key={key.id} position={[center[0], HOUSING_Y, center[1]]} />
        ))}
      </Instances>
      <Instances limit={count} geometry={STEM_GEOMETRY} material={materials.switchStem}>
        {transforms.map(({ key, center }) => (
          <Instance key={key.id} position={[center[0], STEM_Y, center[1]]} />
        ))}
      </Instances>
    </group>
  )
}
