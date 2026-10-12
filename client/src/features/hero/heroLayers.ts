/**
 * Pure data + logic for the home hero's explode-on-scroll
 * (PROJECT_SPECS.md §4.1: "explodes into layers on scroll (keycaps ->
 * switches -> plate -> PCB -> case), with spec callouts appearing at each
 * layer"). Kept framework-agnostic (no React/three/framer-motion imports) so
 * it's trivially unit-testable (`heroLayers.test.ts`) and is the single
 * source of truth both `HeroScene.tsx` (R3F, reads `explodeOffsetY`) and
 * `HeroSection.tsx` (DOM callouts, reads `label`/`fact` + the active-index
 * logic) build on - no numbers/copy duplicated between the two.
 */

export const HERO_LAYER_IDS = ["keycaps", "switches", "plate", "pcb", "case"] as const

export type HeroLayerId = (typeof HERO_LAYER_IDS)[number]

export interface HeroLayerDef {
  id: HeroLayerId
  label: string
  /** One-line, on-brand, non-placeholder spec fact shown as the layer's callout. */
  fact: string
  /**
   * World units this layer travels at full explode (`explodeFactor === 1`).
   * `case` is the explode anchor (0 - every other layer is described as
   * moving away FROM it, both physically in `HeroScene.tsx` and narratively
   * as "the last layer revealed" below).
   */
  explodeOffsetY: number
}

/**
 * Keycaps/switches already bake their own assembled stacking height into
 * their existing component internals (`Keycap`/`Switch`'s own Y constants) -
 * their `<ExplodeLayer baseY>` is 0, this table isn't the place that encodes
 * it. `plate`/`pcb`/`case` are new-this-phase or single-mesh components with
 * no internal stacking of their own, so their assembled Y lives in
 * `HERO_LAYER_BASE_Y` below instead.
 */
export const HERO_LAYERS: Record<HeroLayerId, HeroLayerDef> = {
  keycaps: {
    id: "keycaps",
    label: "Keycaps",
    fact: "PBT double-shot legends, cylindrical profile, cut to fit every layout CLACKFORGE ships.",
    explodeOffsetY: 1.6,
  },
  switches: {
    id: "switches",
    label: "Switches",
    fact: "Hot-swappable 5-pin: linear, tactile, or clicky, each with its own synthesized sound.",
    explodeOffsetY: 0.9,
  },
  plate: {
    id: "plate",
    label: "Plate",
    fact: "Tunes flex and sound signature: aluminum, polycarbonate, or FR4, picked per build.",
    explodeOffsetY: 0.45,
  },
  pcb: {
    id: "pcb",
    label: "PCB",
    fact: "Hot-swap sockets and per-key south-facing LEDs, QMK/VIA-ready out of the box.",
    explodeOffsetY: 0.15,
  },
  case: {
    id: "case",
    label: "Case",
    fact: "Aluminum, polycarbonate, or wood. One shell, four layouts: 60%, 65%, 75%, TKL.",
    explodeOffsetY: 0,
  },
}

/** Assembled (`explodeFactor === 0`) world-space Y for layers with no internal stacking of their own. See `HERO_LAYERS`'s doc comment. */
export const HERO_LAYER_BASE_Y: Record<"plate" | "pcb" | "case", number> = {
  case: 0,
  pcb: -0.15,
  plate: -0.05,
}

/**
 * Buckets `explodeFactor` (0..1) into one of `HERO_LAYER_IDS`'s 5 equal
 * ranges, in order - a "guided tour" narrative (spec: "spec callouts
 * appearing at each layer") layered on top of the explode animation, which
 * itself moves every layer simultaneously (each layer's offset is just
 * scaled by the same `explodeFactor`, not sequenced). `[0, 0.2) -> keycaps`
 * (the first/outermost layer, shown at rest) through `[0.8, 1] -> case` (the
 * last/innermost layer, shown fully exploded).
 */
export function getActiveHeroLayerIndex(explodeFactor: number): number {
  const clamped = Math.min(1, Math.max(0, explodeFactor))
  const index = Math.floor(clamped * HERO_LAYER_IDS.length)
  return Math.min(index, HERO_LAYER_IDS.length - 1)
}

export function getActiveHeroLayer(explodeFactor: number): HeroLayerDef {
  // Non-null: `getActiveHeroLayerIndex` always clamps into `[0, HERO_LAYER_IDS.length - 1]`.
  const id = HERO_LAYER_IDS[getActiveHeroLayerIndex(explodeFactor)] as HeroLayerId
  return HERO_LAYERS[id]
}
