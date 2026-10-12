import type { BuildLayoutId, BuildSlot } from "./build"

/**
 * CLACKFORGE configurator options catalog - schema-driven: every
 * configurator step is rendered from this options definition file (ids,
 * labels, price deltas, swatch values, and compatibility rules). Adding a
 * new case color should require editing data only, not components.
 *
 * LOCATION DECISION: this lives in `/shared`, not under
 * `/client/src/lib/catalog`, because the add-to-cart/checkout path must be
 * able to re-run the exact same option-id -> price-delta lookup the client
 * used, server-side, without re-fetching anything from the client - the
 * server recalculates price and never trusts the client (see
 * `server/src/lib/pricing.ts`'s `computeUnitPrice`). A client-only
 * `options.ts` would force the server to either trust a client-supplied
 * price (the exact anti-pattern this whole app is built to avoid) or
 * duplicate this file across two packages. Import from `@shared` directly,
 * same as every other shared shape.
 *
 * CATALOG-REFERENCE DECISION: switch and keycap options, and the "tuned"
 * stabilizer option, reference a REAL seeded `Product`/`Variant` row (see
 * `catalogRef` below) - a configurator pick for these three slots
 * corresponds to an actual, priced, stocked catalog item, not invented
 * parallel data. Case material/color/finish, cable color, and artisan
 * keycap are CONFIGURATOR-ONLY (no `catalogRef`): no standalone "case" or
 * "cable" `Product` exists in the seed catalog (a case is only ever sold as
 * part of a configured build or bundled into a fixed `KIT`), so inventing
 * one just to satisfy a referencing convention would be dead, parallel
 * catalog data for no benefit. The one near-miss is `coil-cable-amber` (a
 * real seeded ACCESSORY) - deliberately NOT reused as the `cable` slot's
 * catalog ref, because that product is a standalone add-on-cable SKU sold
 * on its own product page with its own length variants, a different
 * purchase than "which color is my build's permanently-attached cable";
 * conflating the two would make the standalone accessory's stock/variants
 * incorrectly gate configurator cable color choices.
 *
 * PRICING SIMPLIFICATION, documented (see `pricing.ts`): every option's
 * `priceDeltaCents` is a FLAT amount added to the build subtotal once per
 * selection, not scaled per key. Switch/keycap options in particular are
 * priced off a representative "Pack of 70" (or equivalent full-kit) variant
 * of the referenced product regardless of the chosen layout's actual key
 * count (a 60% board and a TKL board cost the same in switches here, which
 * is not realistic). This is a deliberate scope cut, not an oversight - a
 * true per-key price (`priceDeltaCents / packSize * layoutKeyCount`) needs
 * the active layout's key COUNT, which would require either duplicating
 * layout geometry into `/shared` (forbidden - geometry is client-only) or
 * threading a key-count argument through every pricing call. A good
 * follow-up, not required for a correct, testable `{ lineItems, subtotal }`
 * contract, which this still delivers exactly.
 *
 * `catalogRef.variantSku` is OPTIONAL - `stab-tuned` references
 * `stabilizer-tuning-kit`, a real seeded zero-variant product (`variants:
 * []`), priced off `Product.basePrice` alone. Same "zero-variant product,
 * referenced by id alone" pattern already established for cart lines
 * (`cart.ts`'s `refineNotBothVariantAndBuild` doc comment).
 *
 * LIVE-PRICE CAVEAT: `priceDeltaCents` below is a point-in-time snapshot of
 * the referenced catalog row's real price, computed by hand at authoring
 * time (NOT looked up live from Prisma - this module has no DB access, by
 * design, so client and server import the identical static values). If an
 * admin edits `ember-linear`'s price in the DB, this catalog goes stale
 * until a human updates it here too. Same caveat applies to referenced
 * products' STOCK - `glacier-linear` and `midnight-spherical` are listed as
 * selectable switch/keycap options even though their seeded variants are
 * currently 0-stock; this catalog describes what's CONCEPTUALLY offered, not
 * live availability. A real "is this actually orderable right now" check is
 * an application-layer DB read against the live `Variant.stock`, same as
 * every other add-to-cart stock check in this app - out of scope for a pure,
 * synchronous options catalog.
 */

export interface ConfiguratorOptionCatalogRef {
  /** Real seeded `Product.slug` (see `server/prisma/seed.ts`). */
  productSlug: string
  /** Real seeded `Variant.sku`. Omitted for zero-variant products (priced off `Product.basePrice` alone). */
  variantSku?: string
}

export interface ConfiguratorOption {
  /** Stable, human-readable id - e.g. `"case-mat-aluminum"`. Opaque string, not a DB id. */
  id: string
  slot: BuildSlot
  label: string
  /** One-line, on-brand description - shown as step-UI help text / spec-sheet detail. */
  description: string
  /** Cents added to the build subtotal when this option is selected. Can be 0 (included in base) but never negative (unlike a `Variant.priceDelta`, a configurator add-on never makes the build cheaper). */
  priceDeltaCents: number
  /** Hex swatch for color-bearing options (case/cable colors). Undefined for non-color options (materials, finishes, plate, switches, keycaps, stabilizers). */
  swatchHex?: string
  /** Set only for options backed by a real seeded Product/Variant (switches, keycaps, tuned stabilizers). */
  catalogRef?: ConfiguratorOptionCatalogRef
}

// ---------------------------------------------------------------------------
// Case material (step 2a)
// ---------------------------------------------------------------------------

export const CASE_MATERIAL_OPTIONS: ConfiguratorOption[] = [
  {
    id: "case-mat-aluminum",
    slot: "caseMaterial",
    label: "CNC Aluminum",
    description: "Dense, machined block with zero flex. The house default.",
    priceDeltaCents: 0,
  },
  {
    id: "case-mat-polycarbonate",
    slot: "caseMaterial",
    label: "Polycarbonate",
    description: "Lighter, see-through shell with a warmer, deeper sound.",
    priceDeltaCents: 0,
  },
  {
    id: "case-mat-walnut",
    slot: "caseMaterial",
    label: "Walnut",
    description: "Hand-finished hardwood shell with a softer, woodier tone.",
    priceDeltaCents: 4500,
  },
]

// ---------------------------------------------------------------------------
// Case color (step 2b) - swatch hexes reuse/extend materials.ts's palette
// (client/src/components/three/materials.ts BRAND_HEX). Extensions beyond
// that palette are marked inline.
// ---------------------------------------------------------------------------

export const CASE_COLOR_OPTIONS: ConfiguratorOption[] = [
  {
    id: "case-col-graphite",
    slot: "caseColor",
    label: "Graphite",
    description: "The house neutral, a deep graphite.",
    priceDeltaCents: 0,
    swatchHex: "#363c48",
  },
  {
    id: "case-col-forge-amber",
    slot: "caseColor",
    label: "Forge Amber",
    description: "The brand's hot primary accent, cast into the shell itself.",
    priceDeltaCents: 1000,
    swatchHex: "#fa8927",
  },
  {
    id: "case-col-switch-cyan",
    slot: "caseColor",
    label: "Switch-LED Cyan",
    description: "The brand's cool accent, for a shell that matches its own glow.",
    priceDeltaCents: 1000,
    swatchHex: "#26c0cf",
  },
  {
    id: "case-col-frost-white",
    slot: "caseColor",
    label: "Frost White",
    description: "A clean off-white shell. Extends materials.ts's palette (not previously used in the 3D scene).",
    priceDeltaCents: 1000,
    swatchHex: "#e7e9ec",
  },
  {
    id: "case-col-natural-walnut",
    slot: "caseColor",
    label: "Natural Walnut",
    description: "Unstained, raw hardwood grain. Walnut-only colorway.",
    priceDeltaCents: 0,
    swatchHex: "#6b4226",
  },
  {
    id: "case-col-ebony-stain",
    slot: "caseColor",
    label: "Ebony Stain",
    description: "A dark stain over walnut grain, still visibly wood. Walnut-only colorway.",
    priceDeltaCents: 500,
    swatchHex: "#2a1d17",
  },
]

// ---------------------------------------------------------------------------
// Case finish (step 2c)
// ---------------------------------------------------------------------------

export const CASE_FINISH_OPTIONS: ConfiguratorOption[] = [
  {
    id: "case-fin-anodized",
    slot: "caseFinish",
    label: "Anodized",
    description: "Electrochemically sealed color, aluminum only.",
    priceDeltaCents: 0,
  },
  {
    id: "case-fin-frosted",
    slot: "caseFinish",
    label: "Frosted",
    description: "A soft-touch matte texture over polycarbonate.",
    priceDeltaCents: 300,
  },
  {
    id: "case-fin-matte",
    slot: "caseFinish",
    label: "Matte",
    description: "A flat, low-glare finish. Works on every material, the only finish wood supports.",
    priceDeltaCents: 0,
  },
]

// ---------------------------------------------------------------------------
// Plate (step 3)
// ---------------------------------------------------------------------------

export const PLATE_OPTIONS: ConfiguratorOption[] = [
  {
    id: "plate-aluminum",
    slot: "plate",
    label: "Aluminum Plate",
    description: "Crisp, bright sound signature with firm key feel.",
    priceDeltaCents: 0,
  },
  {
    id: "plate-polycarbonate",
    slot: "plate",
    label: "Polycarbonate Plate",
    description: "Softer flex underfoot, a deeper, rounder tone.",
    priceDeltaCents: 0,
  },
  {
    id: "plate-fr4",
    slot: "plate",
    label: "FR4 Plate",
    description: "Balanced flex with a focused, mid-range click.",
    priceDeltaCents: 500,
  },
  {
    id: "plate-silent-foam",
    slot: "plate",
    label: "Silent Foam Plate",
    description: "Foam-backed dampening for a noticeably quieter stroke.",
    priceDeltaCents: 800,
  },
]

// ---------------------------------------------------------------------------
// Switches (step 4) - catalogRef'd to real seeded SWITCH products, priced
// off each product's "Pack of 70" variant (see module doc comment's pricing
// simplification note).
// ---------------------------------------------------------------------------

export const SWITCH_OPTIONS: ConfiguratorOption[] = [
  {
    id: "switch-ember-linear",
    slot: "switches",
    label: "Ember Linear",
    description: "The house linear: smooth, quiet-leaning, deep in tone.",
    priceDeltaCents: 6300, // 900 base + 5400 (EMB-LIN-70)
    catalogRef: { productSlug: "ember-linear", variantSku: "EMB-LIN-70" },
  },
  {
    id: "switch-glacier-linear",
    slot: "switches",
    label: "Glacier Linear",
    description: "Ultra-light, rapid-fire linear. Currently between production batches.",
    priceDeltaCents: 5850, // 850 base + 5000 (GLC-LIN-70)
    catalogRef: { productSlug: "glacier-linear", variantSku: "GLC-LIN-70" },
  },
  {
    id: "switch-slimline-linear",
    slot: "switches",
    label: "Slimline Linear",
    description: "Short-travel linear, sized for low-profile builds.",
    priceDeltaCents: 7300, // 1100 base + 6200 (SLM-LIN-70)
    catalogRef: { productSlug: "slimline-linear", variantSku: "SLM-LIN-70" },
  },
  {
    id: "switch-hearth-tactile",
    slot: "switches",
    label: "Hearth Tactile",
    description: "The house tactile: a clear, consistent bump with no scratch.",
    priceDeltaCents: 6650, // 950 base + 5700 (HRT-TAC-70)
    catalogRef: { productSlug: "hearth-tactile", variantSku: "HRT-TAC-70" },
  },
  {
    id: "switch-riot-clicky",
    slot: "switches",
    label: "Riot Clicky",
    description: "Loud on purpose, with a sharp, high-pitched click bar.",
    priceDeltaCents: 6000, // 1000 base + 5000 (RIOT-CLK-70)
    catalogRef: { productSlug: "riot-clicky", variantSku: "RIOT-CLK-70" },
  },
  {
    id: "switch-arc-clicky",
    slot: "switches",
    label: "Arc Clicky",
    description: "A tighter, quieter snap than Riot, with a shorter reset.",
    priceDeltaCents: 6950, // 1050 base + 5900 (ARC-CLK-70)
    catalogRef: { productSlug: "arc-clicky", variantSku: "ARC-CLK-70" },
  },
]

// ---------------------------------------------------------------------------
// Keycaps (step 5) - catalogRef'd to real seeded KEYCAP_SET products.
// Standard and Full-kit variants are offered as distinct options.
// ---------------------------------------------------------------------------

export const KEYCAP_OPTIONS: ConfiguratorOption[] = [
  {
    id: "keycap-signal-standard",
    slot: "keycaps",
    label: "Signal (Standard)",
    description: "Dye-sub PBT in graphite and switch-LED cyan, cylindrical profile.",
    priceDeltaCents: 8900,
    catalogRef: { productSlug: "signal-set", variantSku: "SIG-STD" },
  },
  {
    id: "keycap-signal-full",
    slot: "keycaps",
    label: "Signal (Full Kit)",
    description: "Signal's standard kit plus its novelty accent caps.",
    priceDeltaCents: 11100,
    catalogRef: { productSlug: "signal-set", variantSku: "SIG-FULL" },
  },
  {
    id: "keycap-quarry-standard",
    slot: "keycaps",
    label: "Quarry (Standard)",
    description: "Stonewash grey dye-sub PBT with a lightly textured top.",
    priceDeltaCents: 9400,
    catalogRef: { productSlug: "quarry-set", variantSku: "QRY-STD" },
  },
  {
    id: "keycap-quarry-full",
    slot: "keycaps",
    label: "Quarry (Full Kit)",
    description: "Quarry's standard kit plus its novelty accent caps.",
    priceDeltaCents: 11800,
    catalogRef: { productSlug: "quarry-set", variantSku: "QRY-FULL" },
  },
  {
    id: "keycap-midnight-spherical",
    slot: "keycaps",
    label: "Midnight Spherical",
    description: "Deep navy, spherical profile, silver legends. Between production runs.",
    priceDeltaCents: 9900,
    catalogRef: { productSlug: "midnight-spherical", variantSku: "MDN-STD" },
  },
]

// ---------------------------------------------------------------------------
// Stabilizers (step 3/7 - spec lists "stabilizer tuning" under Extras, but it
// folds into the EXISTING `stabilizers` slot rather than a new one: tuning
// is a binary upgrade on the same physical part, not an independent
// product dimension, so one slot with two options keeps the "one id per
// BuildSlot" pattern intact instead of adding a redundant boolean field.)
// ---------------------------------------------------------------------------

export const STABILIZER_OPTIONS: ConfiguratorOption[] = [
  {
    id: "stab-stock",
    slot: "stabilizers",
    label: "Stock Stabilizers",
    description: "Factory-fit plate-mount stabilizers, included.",
    priceDeltaCents: 0,
  },
  {
    id: "stab-tuned",
    slot: "stabilizers",
    label: "Hand-Tuned Stabilizers",
    description: "Greased, band-aid-modded, and clip-in balanced before it ships.",
    priceDeltaCents: 1800, // = stabilizer-tuning-kit's basePrice (zero-variant product)
    catalogRef: { productSlug: "stabilizer-tuning-kit" },
  },
]

// ---------------------------------------------------------------------------
// Cable (step 7, extras) - configurator-only, see module doc comment for why
// this is NOT catalogRef'd to the standalone coil-cable-amber accessory.
// ---------------------------------------------------------------------------

export const CABLE_OPTIONS: ConfiguratorOption[] = [
  {
    id: "cable-graphite",
    slot: "cable",
    label: "Graphite",
    description: "A straight graphite cable, flush with the case.",
    priceDeltaCents: 0,
    swatchHex: "#15181f",
  },
  {
    id: "cable-forge-amber",
    slot: "cable",
    label: "Forge Amber",
    description: "A coiled cable in the brand's primary accent.",
    priceDeltaCents: 500,
    swatchHex: "#fa8927",
  },
  {
    id: "cable-switch-cyan",
    slot: "cable",
    label: "Switch-LED Cyan",
    description: "A coiled cable in the brand's cool accent.",
    priceDeltaCents: 500,
    swatchHex: "#26c0cf",
  },
  {
    id: "cable-frost-white",
    slot: "cable",
    label: "Frost White",
    description: "A coiled cable in a clean off-white. Pairs with lighter case colorways only.",
    priceDeltaCents: 500,
    swatchHex: "#e7e9ec",
  },
]

// ---------------------------------------------------------------------------
// Artisan keycap (step 7, extras) - configurator-only, optional. Unset in
// `BuildSelections` (no "none" option id) means no artisan cap, consistent
// with every other optional slot's "absent key = not selected" semantics.
// ---------------------------------------------------------------------------

export const ARTISAN_KEYCAP_OPTIONS: ConfiguratorOption[] = [
  {
    id: "artisan-forge-rivet",
    slot: "artisanKeycap",
    label: "Forge Rivet",
    description: "A stylized rivet-head sculpt, cast in amber resin.",
    priceDeltaCents: 1800,
  },
  {
    id: "artisan-cyan-coil",
    slot: "artisanKeycap",
    label: "Cyan Coil",
    description: "A coiled-wire sculpt, cast in cyan-tinted resin.",
    priceDeltaCents: 1800,
  },
  {
    id: "artisan-anvil-mark",
    slot: "artisanKeycap",
    label: "Anvil Mark",
    description: "The brand anvil silhouette, two-tone graphite and amber resin.",
    priceDeltaCents: 2200,
  },
]

/** Every option, flattened - the primary export most consumers want. */
export const CONFIGURATOR_OPTIONS: ConfiguratorOption[] = [
  ...CASE_MATERIAL_OPTIONS,
  ...CASE_COLOR_OPTIONS,
  ...CASE_FINISH_OPTIONS,
  ...PLATE_OPTIONS,
  ...SWITCH_OPTIONS,
  ...KEYCAP_OPTIONS,
  ...STABILIZER_OPTIONS,
  ...CABLE_OPTIONS,
  ...ARTISAN_KEYCAP_OPTIONS,
]

/** O(1) lookup by option id - built once at module load. */
const OPTIONS_BY_ID = new Map(CONFIGURATOR_OPTIONS.map((o) => [o.id, o]))

export function getOptionById(id: string): ConfiguratorOption | undefined {
  return OPTIONS_BY_ID.get(id)
}

export function getOptionsForSlot(slot: BuildSlot): ConfiguratorOption[] {
  return CONFIGURATOR_OPTIONS.filter((o) => o.slot === slot)
}

/**
 * Display labels for layout ids - NOT the layout geometry (that stays in
 * `client/src/lib/catalog/layouts.ts`, client-only). Duplicating four short
 * brand-copy strings here isn't the layout GEOMETRY duplication this
 * package avoids; it's display copy the pricing line items / spec sheet
 * need on both client and server.
 */
export const LAYOUT_LABELS: Record<BuildLayoutId, string> = {
  "60": "60%",
  "65": "65%",
  "75": "75%",
  tkl: "TKL",
}
