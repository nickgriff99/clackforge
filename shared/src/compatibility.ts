import type { BuildLayoutId, BuildSelections, BuildSlot } from "./build"

/**
 * Configurator compatibility rules: certain keycap sets don't support
 * certain layouts, wood cases only ship in certain colors, etc.
 * Incompatible options are disabled with a tooltip explaining why, never
 * silently hidden. `reason` below IS that tooltip text - write it for an
 * end user, not a developer.
 *
 * Each rule is a pure predicate over the build's current (possibly partial)
 * `selections` + its `layout`. A rule that depends on a slot the user hasn't
 * picked yet must NOT fire (return `false`) - "not yet decided" is never
 * "violating," only an actual conflicting pair of picks is.
 *
 * Rules:
 *   1. Anodizing requires an aluminum case (real manufacturing constraint).
 *   2. Frosted finish requires a polycarbonate case.
 *   3. Walnut cases only ship in Matte finish.
 *   4. Walnut cases only ship in wood-appropriate colorways.
 *   5. Midnight Spherical keycaps don't cover 75%/TKL's function row yet.
 *   6. Silent Foam plate isn't offered with clicky switches (defeats the
 *      plate's purpose).
 *   7. Frost White cable only ships with light case colorways.
 */

export interface CompatibilityIssue {
  ruleId: string
  /** End-user-facing tooltip text. */
  reason: string
  /** The two (or more) slots this rule relates - UI uses this to decide which option buttons to disable/annotate. */
  affectedSlots: BuildSlot[]
}

export interface CompatibilityRule extends Omit<CompatibilityIssue, "ruleId"> {
  id: string
  /** Returns true when this rule's incompatible combination is PRESENT (i.e. the build should be blocked). */
  isViolated: (selections: BuildSelections, layout: BuildLayoutId) => boolean
}

const CLICKY_SWITCH_IDS = new Set(["switch-riot-clicky", "switch-arc-clicky"])
const WALNUT_COLOR_IDS = new Set(["case-col-natural-walnut", "case-col-ebony-stain"])
const LIGHT_CABLE_PAIR_COLOR_IDS = new Set(["case-col-frost-white", "case-col-graphite"])

export const COMPATIBILITY_RULES: CompatibilityRule[] = [
  {
    id: "anodized-requires-aluminum",
    reason: "Anodizing is an aluminum-only process. Pick the CNC Aluminum case to unlock Anodized.",
    affectedSlots: ["caseMaterial", "caseFinish"],
    isViolated: (s) => s.caseFinish === "case-fin-anodized" && s.caseMaterial !== undefined && s.caseMaterial !== "case-mat-aluminum",
  },
  {
    id: "frosted-requires-polycarbonate",
    reason: "Frosted is a polycarbonate treatment. Switch to the Polycarbonate case to unlock it.",
    affectedSlots: ["caseMaterial", "caseFinish"],
    isViolated: (s) => s.caseFinish === "case-fin-frosted" && s.caseMaterial !== undefined && s.caseMaterial !== "case-mat-polycarbonate",
  },
  {
    id: "walnut-matte-only",
    reason: "Walnut ships with a natural Matte finish only. Anodized and Frosted don't apply to wood.",
    affectedSlots: ["caseMaterial", "caseFinish"],
    isViolated: (s) => s.caseMaterial === "case-mat-walnut" && s.caseFinish !== undefined && s.caseFinish !== "case-fin-matte",
  },
  {
    id: "walnut-color-restriction",
    reason: "Walnut cases are only available in Natural Walnut or Ebony Stain. Painted colorways don't apply to wood shells.",
    affectedSlots: ["caseMaterial", "caseColor"],
    isViolated: (s) => s.caseMaterial === "case-mat-walnut" && s.caseColor !== undefined && !WALNUT_COLOR_IDS.has(s.caseColor),
  },
  {
    id: "midnight-spherical-layout",
    reason: "Midnight Spherical doesn't include function-row legends yet. Not available for 75% or TKL builds.",
    affectedSlots: ["keycaps"],
    isViolated: (s, layout) => s.keycaps === "keycap-midnight-spherical" && (layout === "75" || layout === "tkl"),
  },
  {
    id: "silent-foam-vs-clicky",
    reason: "Silent Foam is tuned to dampen switch noise. Pairing it with a clicky switch defeats the point, so we don't offer that combo.",
    affectedSlots: ["plate", "switches"],
    isViolated: (s) => s.plate === "plate-silent-foam" && s.switches !== undefined && CLICKY_SWITCH_IDS.has(s.switches),
  },
  {
    id: "frost-cable-vs-case-color",
    reason: "Frost White cable only ships with the Frost White or Graphite case colorways for now.",
    affectedSlots: ["cable", "caseColor"],
    isViolated: (s) => s.cable === "cable-frost-white" && s.caseColor !== undefined && !LIGHT_CABLE_PAIR_COLOR_IDS.has(s.caseColor),
  },
]

/**
 * Returns every violated rule for the given (possibly partial) selections +
 * layout. Empty array = fully compatible. This is what the live configurator
 * stepper UI should call on every selection change to disable options + render
 * tooltips; `calculatePrice` (`pricing.ts`) also calls this internally as a
 * defense-in-depth check before pricing (never price a build the UI should
 * have blocked, in case a request reaches the server directly).
 */
export function checkCompatibility(selections: BuildSelections, layout: BuildLayoutId): CompatibilityIssue[] {
  return COMPATIBILITY_RULES.filter((rule) => rule.isViolated(selections, layout)).map((rule) => ({
    ruleId: rule.id,
    reason: rule.reason,
    affectedSlots: rule.affectedSlots,
  }))
}
