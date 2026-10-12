/**
 * Procedural PCB layer (PROJECT_SPECS.md §4.1 hero explode: keycaps ->
 * switches -> plate -> PCB -> case). New this phase, same spirit as
 * `Plate.tsx`: a flat box sized to the layout bounds plus a couple of cheap
 * surface details ("notches") rather than per-key hot-swap-socket geometry,
 * which would need real per-key meshes/CSG - out of scope for a hero
 * showpiece per the spec's procedural-geometry performance rule.
 *
 * Details: a USB connector nub along the back edge, and a row of small
 * component "bumps" (stand-ins for a reset switch, stabilizer diodes, etc.)
 * near the front edge - enough visual texture to read as a real PCB silhouette
 * once separated from the plate above it, not a per-component simulation.
 */
import { useMemo } from "react"
import { type KeyDef, getLayoutBounds } from "@/lib/catalog/layouts"
import { materials } from "./materials"

const PCB_MARGIN = 0.35
const PCB_HEIGHT = 0.08
const USB_NUB_SIZE: [number, number, number] = [0.5, 0.1, 0.18]
const BUMP_SIZE: [number, number, number] = [0.18, 0.06, 0.1]
const BUMP_COUNT = 4

export interface PcbProps {
  keys: KeyDef[]
}

/** Renders at local Y 0 - see `Plate.tsx`'s doc comment for why; the caller's `<ExplodeLayer>` owns this layer's world-space Y. */
export function Pcb({ keys }: PcbProps) {
  const { width, depth } = useMemo(() => getLayoutBounds(keys), [keys])
  const pcbWidth = width + PCB_MARGIN * 2
  const pcbDepth = depth + PCB_MARGIN * 2

  const usbY = PCB_HEIGHT / 2 + USB_NUB_SIZE[1] / 2
  const usbZ = -pcbDepth / 2 - USB_NUB_SIZE[2] / 2 + 0.05

  const bumpY = PCB_HEIGHT / 2 + BUMP_SIZE[1] / 2
  const bumpZ = pcbDepth / 2 - 0.25
  const bumpSpacing = (pcbWidth - 0.6) / (BUMP_COUNT - 1)
  const bumpStartX = -(pcbWidth - 0.6) / 2

  return (
    <group>
      <mesh position={[0, 0, 0]} material={materials.pcb}>
        <boxGeometry args={[pcbWidth, PCB_HEIGHT, pcbDepth]} />
      </mesh>
      <mesh position={[0, usbY, usbZ]} material={materials.hardware}>
        <boxGeometry args={USB_NUB_SIZE} />
      </mesh>
      {Array.from({ length: BUMP_COUNT }, (_, i) => (
        <mesh key={i} position={[bumpStartX + bumpSpacing * i, bumpY, bumpZ]} material={materials.hardware}>
          <boxGeometry args={BUMP_SIZE} />
        </mesh>
      ))}
    </group>
  )
}
