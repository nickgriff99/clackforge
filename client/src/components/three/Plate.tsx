/**
 * Procedural mounting plate layer for the hero explode sequence (keycaps
 * -> switches -> plate -> PCB -> case). Sized to the active layout's
 * bounding box exactly like `Case.tsx` does, with a small inset margin
 * (real plates sit just inside the case bezel, not flush with it) so the
 * two read as distinct layers once exploded apart.
 *
 * Detail is 4 corner screw-post cylinders standing proud of the plate's
 * top face. Real plates have a switch-shaped cutout under every key, which
 * would need per-key boolean geometry (CSG) - out of scope, since
 * procedural geometry keeps the draw count flat no matter how many keys
 * the layout has. The screw posts are the "good enough to read as a real
 * plate, not a slab" detail instead.
 */
import { useMemo } from "react"
import { type KeyDef, getLayoutBounds } from "@/lib/catalog/layouts"
import { materials } from "./materials"

const PLATE_MARGIN = 0.3
const PLATE_HEIGHT = 0.12
const POST_RADIUS = 0.06
const POST_HEIGHT = PLATE_HEIGHT * 1.6
const POST_INSET = 0.35

export interface PlateProps {
  keys: KeyDef[]
}

/**
 * Renders at local Y 0 - the caller's `<ExplodeLayer baseY={...}>` wrapper
 * owns this layer's assembled world-space Y entirely (see `HeroScene.tsx`'s
 * `HERO_LAYERS` table), so this component only needs its own internal
 * part-to-part offsets (the plate slab vs. its corner posts).
 */
export function Plate({ keys }: PlateProps) {
  const { width, depth } = useMemo(() => getLayoutBounds(keys), [keys])
  const plateWidth = width + PLATE_MARGIN * 2
  const plateDepth = depth + PLATE_MARGIN * 2
  const halfW = plateWidth / 2 - POST_INSET
  const halfD = plateDepth / 2 - POST_INSET
  const postY = PLATE_HEIGHT / 2 + POST_HEIGHT / 2 - 0.02

  const corners: [number, number][] = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
  ]

  return (
    <group>
      <mesh position={[0, 0, 0]} material={materials.plate}>
        <boxGeometry args={[plateWidth, PLATE_HEIGHT, plateDepth]} />
      </mesh>
      {corners.map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, postY, z]} material={materials.hardware}>
          <cylinderGeometry args={[POST_RADIUS, POST_RADIUS, POST_HEIGHT, 10]} />
        </mesh>
      ))}
    </group>
  )
}
