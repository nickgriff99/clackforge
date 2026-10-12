import { z } from "zod"

/**
 * Switch detail page contract. Promotes `SwitchFeel` from its old
 * client-only home (`client/src/lib/audio/switchFeel.ts`, which mapped a
 * CONFIGURATOR OPTION ID -> feel, for the sound-test preview) to this shared
 * module, which is keyed by real seeded `Product.slug` instead. These are
 * two different, both-still-valid key spaces over the same six switches -
 * `switchFeel.ts`'s `SWITCH_FEEL_BY_OPTION_ID` is untouched, it still owns
 * the option-id lookup for the sound test; it now just imports the shared
 * `SwitchFeel` type instead of declaring its own copy.
 *
 * NUMBERS ARE NOT INVENTED: `actuationForceG`, `bottomOutForceG`,
 * `totalTravelMm`, and `feel` for every entry in `SWITCH_SPECS` below are
 * copied verbatim from that same product's seeded `Product.specs` display
 * strings in `server/prisma/seed.ts` ("45g" -> 45, "4.0mm" -> 4.0, etc.) -
 * confirmed by reading the seed file directly, not assumed. This is
 * deliberate: the shop page's spec-sheet strings and this page's numeric
 * chart must never contradict each other. Only
 * `preTravelMm`, `forceCurve`, and `explodedParts` are new, invented-but-
 * realistic data with no prior seeded source (the seed file has no travel
 * curve or sub-part breakdown).
 *
 * FORCE-CURVE SHAPES (see `forceCurve` on each entry below): the three
 * `feel`s are built to be visually/behaviorally distinguishable, not just
 * labeled differently -
 *   - linear: strictly non-decreasing from 0 to bottomOutForceG, with the
 *     point at `preTravelMm` landing exactly on `actuationForceG`.
 *   - tactile: rises to a BUMP (a local max strictly greater than its
 *     neighbors) slightly before `preTravelMm`, dips back down to exactly
 *     `actuationForceG` at `preTravelMm` (the bump "gives way" as the
 *     switch actuates), then keeps rising to `bottomOutForceG`. The bump
 *     peak is a local max but never the curve's global max - bottom-out is
 *     still the heaviest point, same as a real tactile switch.
 *   - clicky: rises to a peak of exactly `actuationForceG` AT
 *     `preTravelMm` (the click bar's resistance peaks right as it's about
 *     to snap), then SUDDENLY DROPS (the actual click/snap) before
 *     resuming its climb to `bottomOutForceG`.
 * `switchSpec.test.ts` asserts these three shape-claims structurally
 * (not just by eyeballing the numbers), so a future edit to any curve that
 * breaks the distinction fails a test, not just a chart.
 */

export type SwitchFeel = "linear" | "tactile" | "clicky"
export const SwitchFeelSchema = z.enum(["linear", "tactile", "clicky"])

export const SwitchExplodedPartIdSchema = z.enum(["stem", "spring", "topHousing", "bottomHousing"])
export type SwitchExplodedPartId = z.infer<typeof SwitchExplodedPartIdSchema>

export const SwitchExplodedPartSchema = z.object({
  id: SwitchExplodedPartIdSchema,
  label: z.string().min(1),
  explodeOffsetY: z.number(),
})
export type SwitchExplodedPart = z.infer<typeof SwitchExplodedPartSchema>

export const SwitchForceCurvePointSchema = z.object({
  travelMm: z.number().min(0),
  forceG: z.number().min(0),
})
export type SwitchForceCurvePoint = z.infer<typeof SwitchForceCurvePointSchema>

export const SwitchSpecSchema = z
  .object({
    productSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    feel: SwitchFeelSchema,
    actuationForceG: z.number().positive(),
    bottomOutForceG: z.number().positive(),
    preTravelMm: z.number().positive(),
    totalTravelMm: z.number().positive(),
    forceCurve: z.array(SwitchForceCurvePointSchema).min(2),
    explodedParts: z.array(SwitchExplodedPartSchema).length(4),
  })
  .refine((s) => s.actuationForceG < s.bottomOutForceG, { message: "actuation must be less than bottom-out", path: ["actuationForceG"] })
  .refine((s) => s.preTravelMm < s.totalTravelMm, { message: "preTravel must be less than totalTravel", path: ["preTravelMm"] })
  .refine(
    (s) => {
      const pts = s.forceCurve
      const first = pts[0]!
      const last = pts[pts.length - 1]!
      return (
        first.travelMm === 0 &&
        last.travelMm === s.totalTravelMm &&
        pts.every((p, i) => i === 0 || p.travelMm > pts[i - 1]!.travelMm)
      )
    },
    { message: "forceCurve must start at 0, end at totalTravelMm, and be strictly ascending by travelMm", path: ["forceCurve"] },
  )
export type SwitchSpec = z.infer<typeof SwitchSpecSchema>

// ---------------------------------------------------------------------------
// Shared exploded-view geometry - same physical shell across every switch in
// the catalog (all 6 are standard 3-pin/5-pin MX-style housings), so every
// entry below reuses this exact array rather than re-declaring it.
// ---------------------------------------------------------------------------

const SHARED_EXPLODED_PARTS: SwitchExplodedPart[] = [
  { id: "stem", label: "Stem", explodeOffsetY: 1.2 },
  { id: "spring", label: "Spring", explodeOffsetY: 0.6 },
  { id: "topHousing", label: "Top Housing", explodeOffsetY: 0.9 },
  { id: "bottomHousing", label: "Bottom Housing", explodeOffsetY: -0.8 },
]

// ---------------------------------------------------------------------------
// SWITCH_SPECS - one entry per seeded SWITCH product (6 total, confirmed
// against `server/prisma/seed.ts`: ember-linear, riot-clicky,
// hearth-tactile, glacier-linear, arc-clicky, slimline-linear).
// ---------------------------------------------------------------------------

export const SWITCH_SPECS: SwitchSpec[] = [
  {
    productSlug: "ember-linear",
    feel: "linear",
    actuationForceG: 45,
    bottomOutForceG: 58,
    preTravelMm: 2.0,
    totalTravelMm: 4.0,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.5, forceG: 11 },
      { travelMm: 1.0, forceG: 22 },
      { travelMm: 1.5, forceG: 34 },
      { travelMm: 2.0, forceG: 45 },
      { travelMm: 2.5, forceG: 49 },
      { travelMm: 3.0, forceG: 52 },
      { travelMm: 3.5, forceG: 55 },
      { travelMm: 4.0, forceG: 58 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
  {
    productSlug: "riot-clicky",
    feel: "clicky",
    actuationForceG: 50,
    bottomOutForceG: 62,
    preTravelMm: 2.0,
    totalTravelMm: 4.0,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.5, forceG: 15 },
      { travelMm: 1.0, forceG: 28 },
      { travelMm: 1.5, forceG: 40 },
      { travelMm: 2.0, forceG: 50 },
      { travelMm: 2.3, forceG: 35 },
      { travelMm: 2.8, forceG: 44 },
      { travelMm: 3.2, forceG: 52 },
      { travelMm: 3.6, forceG: 58 },
      { travelMm: 4.0, forceG: 62 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
  {
    productSlug: "hearth-tactile",
    feel: "tactile",
    actuationForceG: 52,
    bottomOutForceG: 65,
    preTravelMm: 1.9,
    totalTravelMm: 3.8,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.5, forceG: 13 },
      { travelMm: 1.0, forceG: 27 },
      { travelMm: 1.5, forceG: 42 },
      { travelMm: 1.7, forceG: 58 },
      { travelMm: 1.9, forceG: 52 },
      { travelMm: 2.3, forceG: 56 },
      { travelMm: 2.8, forceG: 60 },
      { travelMm: 3.3, forceG: 63 },
      { travelMm: 3.8, forceG: 65 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
  {
    productSlug: "glacier-linear",
    feel: "linear",
    actuationForceG: 38,
    bottomOutForceG: 48,
    preTravelMm: 2.0,
    totalTravelMm: 4.0,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.5, forceG: 9 },
      { travelMm: 1.0, forceG: 18 },
      { travelMm: 1.5, forceG: 28 },
      { travelMm: 2.0, forceG: 38 },
      { travelMm: 2.5, forceG: 41 },
      { travelMm: 3.0, forceG: 44 },
      { travelMm: 3.5, forceG: 46 },
      { travelMm: 4.0, forceG: 48 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
  {
    productSlug: "arc-clicky",
    feel: "clicky",
    actuationForceG: 48,
    bottomOutForceG: 60,
    preTravelMm: 1.9,
    totalTravelMm: 3.8,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.45, forceG: 14 },
      { travelMm: 0.9, forceG: 26 },
      { travelMm: 1.4, forceG: 38 },
      { travelMm: 1.9, forceG: 48 },
      { travelMm: 2.2, forceG: 33 },
      { travelMm: 2.6, forceG: 42 },
      { travelMm: 3.0, forceG: 50 },
      { travelMm: 3.4, forceG: 56 },
      { travelMm: 3.8, forceG: 60 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
  {
    productSlug: "slimline-linear",
    feel: "linear",
    actuationForceG: 45,
    bottomOutForceG: 55,
    preTravelMm: 1.6,
    totalTravelMm: 3.2,
    forceCurve: [
      { travelMm: 0, forceG: 0 },
      { travelMm: 0.4, forceG: 10 },
      { travelMm: 0.8, forceG: 20 },
      { travelMm: 1.2, forceG: 32 },
      { travelMm: 1.6, forceG: 45 },
      { travelMm: 2.0, forceG: 48 },
      { travelMm: 2.4, forceG: 50 },
      { travelMm: 2.8, forceG: 53 },
      { travelMm: 3.2, forceG: 55 },
    ],
    explodedParts: SHARED_EXPLODED_PARTS,
  },
]

/** O(1) lookup by product slug - built once at module load, same pattern as `options.ts`'s `getOptionById`. */
const SWITCH_SPECS_BY_SLUG = new Map(SWITCH_SPECS.map((s) => [s.productSlug, s]))

export function getSwitchSpecBySlug(slug: string): SwitchSpec | undefined {
  return SWITCH_SPECS_BY_SLUG.get(slug)
}
