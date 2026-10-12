/**
 * `<Keyboard layout={...} />` renders any layout. `layout` is the raw
 * array of key defs (see `client/src/lib/catalog/layouts.ts`): pass any
 * layout's `.keys` (or a hand-built array matching the same shape) and
 * this composes a full procedural keyboard from it - no per-layout
 * components, ever.
 */
import type { KeyDef } from "@/lib/catalog/layouts"
import { Case } from "./Case"
import { Keycap } from "./Keycap"
import { Switch } from "./Switch"

export interface KeyboardProps {
  /** Array of `{ id, label, x, y, width, height, row }` key positions - the single source of truth for this render. */
  layout: KeyDef[]
  /** Key ids to render with the accent keycap material (per-key customization seam - currently unused). */
  accentKeyIds?: ReadonlySet<string>
  /** Case color/material/finish overrides, threaded straight to `<Case>`. Unset falls back to its defaults. */
  caseColorHex?: string
  caseRoughness?: number
  caseMetalness?: number
}

export function Keyboard({ layout, accentKeyIds, caseColorHex, caseRoughness, caseMetalness }: KeyboardProps) {
  return (
    <group>
      <Case keys={layout} colorHex={caseColorHex} roughness={caseRoughness} metalness={caseMetalness} />
      <Switch keys={layout} />
      <Keycap keys={layout} accentKeyIds={accentKeyIds} />
    </group>
  )
}
