import type { BuildSlot } from "@shared"

export interface SlotMeta {
  label: string
  helpText: string
  optional?: boolean
}

/**
 * Display copy for each `BuildSlot` - the one place step titles/help text
 * live, so `OptionStep` (the generic step renderer, PROJECT_SPECS.md §8)
 * never hardcodes per-slot strings.
 */
export const SLOT_META: Record<BuildSlot, SlotMeta> = {
  caseMaterial: {
    label: "Case material",
    helpText: "What the shell is machined or molded from.",
  },
  caseColor: {
    label: "Case color",
    helpText: "The shell's finish color.",
  },
  caseFinish: {
    label: "Case finish",
    helpText: "Surface treatment over the chosen material.",
  },
  plate: {
    label: "Plate",
    helpText: "Sits under the switches and shapes the sound and the feel of bottoming out.",
  },
  switches: {
    label: "Switches",
    helpText: "Linear, tactile, or clicky, from the switch catalog.",
  },
  keycaps: {
    label: "Keycaps",
    helpText: "Profile, colorway, and legend set, from the keycap catalog.",
  },
  stabilizers: {
    label: "Stabilizers",
    helpText: "Keeps wide keys (Space, Enter, Shift) rattle-free.",
  },
  cable: {
    label: "Cable",
    helpText: "Color of the included USB-C cable.",
    optional: true,
  },
  artisanKeycap: {
    label: "Artisan keycap",
    helpText: "An extra sculpted cap to drop in anywhere on the board.",
    optional: true,
  },
}

/** Step order for both the mobile stepper and the desktop panel. */
export const STEP_ORDER: BuildSlot[] = [
  "caseMaterial",
  "caseColor",
  "caseFinish",
  "plate",
  "switches",
  "keycaps",
  "stabilizers",
  "cable",
  "artisanKeycap",
]
