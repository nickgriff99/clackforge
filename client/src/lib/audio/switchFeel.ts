import type { SwitchFeel } from "@shared"

export type { SwitchFeel }

/**
 * `SwitchFeel` is canonically defined in `shared/src/switchSpec.ts`
 * (imported above), which keys switch data by real seeded `Product.slug`
 * for the switch detail page. This file's own map below is a different,
 * still-valid key space (configurator option id, for the sound-test
 * preview).
 *
 * `shared/src/options.ts`'s `ConfiguratorOption` type has no `feel` field
 * for the `switches` slot; linear/tactile/clicky only exists informally
 * today (option id/label naming, and the `Feel` key in
 * `server/prisma/seed.ts`'s seeded `Product.specs`, which the client never
 * fetches for this purpose). Rather than string-sniff `option.id` at every
 * call site, this is the one explicit, exhaustive map of the switch
 * catalog's 6 current options to a feel. Adding a real `feel` field to the
 * shared catalog later should replace this file with a direct read of
 * that field instead - a known gap, not hidden.
 */
const SWITCH_FEEL_BY_OPTION_ID: Record<string, SwitchFeel> = {
  "switch-ember-linear": "linear",
  "switch-glacier-linear": "linear",
  "switch-slimline-linear": "linear",
  "switch-hearth-tactile": "tactile",
  "switch-riot-clicky": "clicky",
  "switch-arc-clicky": "clicky",
}

/**
 * Feel the sound-test field previews before any switch is selected. See
 * `SwitchSoundTest.tsx`'s doc comment for why "default to linear and keep
 * the field enabled" was chosen over disabling it.
 */
export const DEFAULT_SWITCH_FEEL: SwitchFeel = "linear"

/** Unknown/future option ids fall back to `DEFAULT_SWITCH_FEEL` rather than throwing - a missing feel mapping should degrade to "plays *a* sound", never crash the sound test. */
export function getSwitchFeelForOptionId(optionId: string | undefined): SwitchFeel {
  if (!optionId) return DEFAULT_SWITCH_FEEL
  return SWITCH_FEEL_BY_OPTION_ID[optionId] ?? DEFAULT_SWITCH_FEEL
}
