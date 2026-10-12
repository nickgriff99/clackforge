import type { BuildLayoutId } from "@shared"

/**
 * Which seeded KIT product the configurator starts a build from, per layout.
 *
 * Judgment call, documented rather than silently decided: the real seed
 * catalog (`server/prisma/seed.ts`) has more than one configurable KIT
 * product for some layouts (two TKL kits: `foundry-tkl` and `sunder-tkl`),
 * and the configurator's step flow never asks the user to pick a base kit
 * at all - it starts at "Layout." But `BuildConfig.productId` needs a real
 * product to price against (`calculatePrice`'s `basePrice.productId` must
 * match it), so some product must be chosen per layout.
 *
 * This picks one canonical, deterministic representative kit per layout
 * (the first `isConfigurable` KIT seeded for that layout). Letting a user
 * choose among multiple kits sharing a layout (e.g. Foundry vs. Sunder for
 * TKL) is good future scope - not built here.
 */
export const BASE_KIT_SLUG_BY_LAYOUT: Record<BuildLayoutId, string> = {
  "60": "monolith-60",
  "65": "anvil-65",
  "75": "bastion-75",
  tkl: "foundry-tkl",
}
