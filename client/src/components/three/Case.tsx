/**
 * Procedural case shell, sized to the active layout's bounding box - never
 * hand-modeled per layout. A single box mesh (not instanced - there is
 * exactly one case per keyboard).
 */
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { type KeyDef, getLayoutBounds } from "@/lib/catalog/layouts"
import { BRAND_HEX, materials } from "./materials"

/** Bezel margin around the key block, in u. */
const CASE_MARGIN = 0.6
const CASE_HEIGHT = 0.9
/** Top surface of the case sits just under the switch housings (see `Switch.tsx` HOUSING_Y). */
const CASE_TOP_Y = -0.05

// Original shared-material values - also the override fallback when only
// one of colorHex/roughness/metalness is overridden below.
const DEFAULT_ROUGHNESS = 0.55
const DEFAULT_METALNESS = 0.35

export interface CaseProps {
  keys: KeyDef[]
  /**
   * `caseColor` slot hex override for the case color. Unset falls back to
   * the default graphite (the shared `materials.case` singleton, reused
   * as-is, zero extra allocation).
   */
  colorHex?: string
  /** `caseMaterial`/`caseFinish` slot overrides (see `materialPresets.ts`). Unset falls back to the defaults. */
  roughness?: number
  metalness?: number
}

export function Case({ keys, colorHex, roughness, metalness }: CaseProps) {
  const { width, depth } = useMemo(() => getLayoutBounds(keys), [keys])
  const caseWidth = width + CASE_MARGIN * 2
  const caseDepth = depth + CASE_MARGIN * 2

  const hasOverride = colorHex !== undefined || roughness !== undefined || metalness !== undefined

  // Only one `<Case>` exists per scene (unlike Keycap/Switch, never
  // instanced) - creating a fresh material per override is cheap and
  // avoids mutating the shared `materials.case` singleton other code
  // might rely on staying at its defaults.
  const overrideMaterial = useMemo(() => {
    if (!hasOverride) return null
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex ?? BRAND_HEX.caseGraphiteDark),
      roughness: roughness ?? DEFAULT_ROUGHNESS,
      metalness: metalness ?? DEFAULT_METALNESS,
    })
  }, [hasOverride, colorHex, roughness, metalness])

  useEffect(() => {
    return () => overrideMaterial?.dispose()
  }, [overrideMaterial])

  return (
    <mesh position={[0, CASE_TOP_Y - CASE_HEIGHT / 2, 0]} material={overrideMaterial ?? materials.case}>
      <boxGeometry args={[caseWidth, CASE_HEIGHT, caseDepth]} />
    </mesh>
  )
}
