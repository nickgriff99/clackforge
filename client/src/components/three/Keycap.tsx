/**
 * One instanced-mesh-driven keycap layer. Never one mesh per key - a
 * single shared geometry + material pair is created once at module scope,
 * and every key is a cheap `<Instance>` inside drei's `<Instances>` (GPU
 * instancing, one draw call per material group).
 */
import { Instance, Instances } from "@react-three/drei"
import { useMemo } from "react"
import * as THREE from "three"
import type { KeyDef } from "@/lib/catalog/layouts"
import { layoutToWorld } from "./layoutGeometry"
import { materials } from "./materials"

const KEYCAP_HEIGHT = 0.5
const KEYCAP_LIFT = 0.35
/** Footprint shrink factor so adjacent keycaps render with a visible gap. */
const KEYCAP_INSET = 0.92

/** Unit (1u x 1u footprint) keycap geometry - created once, scaled per instance. */
const KEYCAP_GEOMETRY = new THREE.BoxGeometry(1, KEYCAP_HEIGHT, 1)

export interface KeycapProps {
  keys: KeyDef[]
  /** Key ids to render with the accent material (per-key recolor seam). */
  accentKeyIds?: ReadonlySet<string>
}

export function Keycap({ keys, accentKeyIds }: KeycapProps) {
  const transforms = useMemo(() => layoutToWorld(keys), [keys])

  const neutralKeys = useMemo(
    () => (accentKeyIds ? transforms.filter((t) => !accentKeyIds.has(t.key.id)) : transforms),
    [transforms, accentKeyIds],
  )
  const accentKeys = useMemo(
    () => (accentKeyIds ? transforms.filter((t) => accentKeyIds.has(t.key.id)) : []),
    [transforms, accentKeyIds],
  )

  return (
    <group>
      <Instances limit={Math.max(neutralKeys.length, 1)} geometry={KEYCAP_GEOMETRY} material={materials.keycap}>
        {neutralKeys.map(({ key, center }) => (
          <Instance
            key={key.id}
            position={[center[0], KEYCAP_LIFT, center[1]]}
            scale={[key.width * KEYCAP_INSET, 1, key.height * KEYCAP_INSET]}
          />
        ))}
      </Instances>
      {accentKeys.length > 0 && (
        <Instances limit={accentKeys.length} geometry={KEYCAP_GEOMETRY} material={materials.keycapAccent}>
          {accentKeys.map(({ key, center }) => (
            <Instance
              key={key.id}
              position={[center[0], KEYCAP_LIFT, center[1]]}
              scale={[key.width * KEYCAP_INSET, 1, key.height * KEYCAP_INSET]}
            />
          ))}
        </Instances>
      )}
    </group>
  )
}
