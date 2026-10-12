import { z } from "zod"
import { CentsSchema, IdSchema, IsoDateTimeSchema } from "./common"

/**
 * `BuildSlot`. The case is split into three slots (`caseMaterial`/
 * `caseColor`/`caseFinish`) rather than one bundled id, plus two slots for
 * extras (`cable`, `artisanKeycap`). `plate`/`switches`/`keycaps`/
 * `stabilizers` round out the set.
 *
 * Why split `case` into three instead of keeping one id that bundles
 * material+color+finish: the spec's own compatibility examples ("wood cases
 * only in some colors") only make sense if material and color are
 * independently selectable - a single bundled id per material×color×finish
 * combination would need ~45 catalog rows instead of ~13 and make
 * compatibility rules (`compatibility.ts`) combinatorial instead of a plain
 * field comparison.
 */
export const BuildSlotSchema = z.enum([
  "caseMaterial",
  "caseColor",
  "caseFinish",
  "plate",
  "switches",
  "keycaps",
  "stabilizers",
  "cable",
  "artisanKeycap",
])
export type BuildSlot = z.infer<typeof BuildSlotSchema>

/**
 * Keyboard layout id. Mirrors
 * `client/src/lib/catalog/layouts.ts`'s `KeyboardLayoutId` type VALUES only
 * ("60" | "65" | "75" | "tkl"), not its geometry (key positions/widths stay
 * client-only per that file's own scope - a 3D-rendering concern, not a
 * contract one). This is a small, stable set tied to real hobby-standard
 * layouts, not expected to change often - if a 5th layout is ever added,
 * update BOTH this enum and `layouts.ts`'s `KEYBOARD_LAYOUT_IDS` by hand;
 * there is no single source of truth shared between client-only geometry and
 * shared-contract ids by design (geometry must never leak into `/shared`,
 * `/shared` must never be imported by `/client`-only 3D code).
 */
export const BuildLayoutIdSchema = z.enum(["60", "65", "75", "tkl"])
export type BuildLayoutId = z.infer<typeof BuildLayoutIdSchema>

/**
 * `Partial<Record<BuildSlot, optionId>>` - not every slot must be chosen
 * yet (a build mid-configuration, or an intentionally-skipped optional
 * extra like `artisanKeycap`/`cable`, has fewer keys set). Built as an
 * object+`.partial()` (not `z.record`) so the inferred TS type is exactly
 * `Partial<Record<BuildSlot, Id>>` - known zod v3 quirk: `z.record` with an
 * enum key infers as a TOTAL record even though it validates partially.
 *
 * Values are option ids into `shared/src/options.ts`'s catalog - NOT
 * `Variant` ids directly. Some options (switches/keycaps/tuned-stabilizers)
 * map onto a real seeded `Product`/`Variant` via the option's `catalogRef`;
 * others (case material/color/finish, cable, artisan keycap) are
 * configurator-only and have no backing catalog row. See options.ts's
 * doc comment for the full line-drawing rule.
 */
export const BuildSelectionsSchema = z
  .object({
    caseMaterial: IdSchema,
    caseColor: IdSchema,
    caseFinish: IdSchema,
    plate: IdSchema,
    switches: IdSchema,
    keycaps: IdSchema,
    stabilizers: IdSchema,
    cable: IdSchema,
    artisanKeycap: IdSchema,
  })
  .partial()
export type BuildSelections = z.infer<typeof BuildSelectionsSchema>

/**
 * Per-key recolor map - key id matches
 * `KeyboardEvent.code` (same convention as `client/src/lib/catalog/
 * layouts.ts`'s `KeyDef.id`, e.g. `"KeyQ"`, `"Escape"`), value is a color
 * OPTION id (not a raw hex) - same "reference the catalog, don't duplicate
 * its data" rule as `BuildSelections`. Whether a given key id actually
 * exists on the build's active `layout`, and whether the color id actually
 * exists in the catalog, are BOTH facts this schema cannot check (same
 * documented-gap pattern as `cart.ts`'s `refineNotBothVariantAndBuild`): a
 * stray/typo'd key id is simply inert (nothing to recolor), and an unknown
 * color id is caught by `calculatePrice`'s `UNKNOWN_OPTION` error path, not
 * here. Capped at 110 entries - generous slack above the largest layout's
 * key count (TKL, ~87 keys) - purely to bound a tampered/forged payload's
 * size; it is NOT a per-layout exactness check.
 */
export const BuildAccentKeysSchema = z
  .record(z.string().min(1), z.string().min(1))
  .refine((obj) => Object.keys(obj).length <= 110, {
    message: "accentKeys cannot have more than 110 entries",
  })
export type BuildAccentKeys = z.infer<typeof BuildAccentKeysSchema>

/**
 * Schema version for `BuildConfig`'s URL-serialized form (the config
 * serializes to a compact, versioned URL param). The actual encode/decode
 * codec is a separate concern - this field exists so that codec never has
 * to re-touch this schema just to add versioning. Bump this constant
 * whenever `BuildConfigSchema`'s shape changes in a way the URL codec needs
 * to migrate across (e.g. the `case` -> `caseMaterial/caseColor/caseFinish`
 * split above would have been exactly such a bump, had a codec already
 * existed). `calculatePrice` (`pricing.ts`) treats any `config.version !==
 * CURRENT_BUILD_CONFIG_VERSION` as a hard `VERSION_UNSUPPORTED` error rather
 * than attempting to migrate - migration logic belongs to the URL codec,
 * not the pricing engine.
 */
export const CURRENT_BUILD_CONFIG_VERSION = 1

/**
 * Wire shape POSTed to create/update a configurator build - mirrors the
 * client's `BuildConfig` type (`client/src/lib/types.ts`) field for field,
 * with `version`/`layout`/`accentKeys` added.
 */
export const BuildConfigSchema = z.object({
  /** See `CURRENT_BUILD_CONFIG_VERSION`'s doc comment. Required, not defaulted - a caller must say which shape it's building against. */
  version: z.number().int().min(1),
  productId: IdSchema,
  /**
   * Required (unlike every `BuildSelections` slot) - the 3D model, spec
   * sheet, and pricing engine all need a layout to render/compute anything
   * at all, so there is no meaningful "unset" state for this field.
   */
  layout: BuildLayoutIdSchema,
  selections: BuildSelectionsSchema,
  /** Per-key recolors. Optional - most builds set none. */
  accentKeys: BuildAccentKeysSchema.default({}),
  /** Cents - base price + sum of selected option price deltas. Server recalculates via `calculatePrice`, never trusts this. */
  totalPrice: CentsSchema,
})
export type BuildConfig = z.infer<typeof BuildConfigSchema>

/** Full DB-shape `CustomBuild` row (BuildConfig + identity/ownership). */
export const CustomBuildSchema = BuildConfigSchema.extend({
  id: IdSchema,
  /** Nullable - guest configurator state is allowed. */
  userId: IdSchema.nullable(),
  name: z.string().min(1).nullable(),
  createdAt: IsoDateTimeSchema,
})
export type CustomBuild = z.infer<typeof CustomBuildSchema>

export const SavedBuildSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  customBuildId: IdSchema,
  label: z.string().min(1),
  isPublic: z.boolean(),
  createdAt: IsoDateTimeSchema,
})
export type SavedBuild = z.infer<typeof SavedBuildSchema>

// ---------------------------------------------------------------------------
// Saved builds, share-by-id, OG image (shared/README.md has the full
// per-route table; the shapes below are what that table references).
// ---------------------------------------------------------------------------

/**
 * A build's human-facing name/label. Reused for BOTH `CustomBuild.name` and
 * `SavedBuild.label` - see the doc comment on `CreateCustomBuildInputSchema`
 * below for why these two columns always carry the SAME string rather than
 * letting them diverge.
 */
export const BuildLabelSchema = z.string().min(1).max(80)
export type BuildLabel = z.infer<typeof BuildLabelSchema>

/**
 * `POST /api/builds` request body. Deliberately OMITS `totalPrice` -
 * "never trust the client price" applies here exactly as it does to
 * `AddCartItemInputSchema` (cart.ts): the route computes the authoritative
 * price server-side via `calculatePrice` (pricing.ts) and NEVER reads a
 * client-supplied total.
 *
 * `label` is OPTIONAL and controls whether this call also creates a
 * `SavedBuild` row in the SAME request (one round trip, one transaction -
 * not two separate calls): omit it to just mint a shareable `CustomBuild`
 * (e.g. "share" without "save"); provide it to both mint the build AND add
 * it to the user's Account > Saved builds list in one shot (the common case
 * when the Review step's "Save build" button is clicked with a name filled
 * in).
 *
 * TWO-COLUMN NAME: `schema.prisma` carries both `CustomBuild.name` (String?)
 * and `SavedBuild.label` (String) - they are NOT independent. `label`, when
 * provided, is written to BOTH `CustomBuild.name` AND `SavedBuild.label` at
 * create time, and `PATCH /api/builds/:id` (rename) updates BOTH together.
 * There is exactly one user-facing "build name" in this app; it just happens
 * to be stored in two columns for historical reasons - the route code must
 * write/read it as one value, never let the two drift.
 */
export const CreateCustomBuildInputSchema = BuildConfigSchema.omit({ totalPrice: true }).extend({
  label: BuildLabelSchema.optional(),
})
export type CreateCustomBuildInput = z.infer<typeof CreateCustomBuildInputSchema>

/**
 * `PATCH /api/builds/:id` request body - rename only. Writes to both
 * `CustomBuild.name` and `SavedBuild.label` (see `CreateCustomBuildInputSchema`'s
 * doc comment above).
 */
export const RenameSavedBuildInputSchema = z.object({
  label: BuildLabelSchema,
})
export type RenameSavedBuildInput = z.infer<typeof RenameSavedBuildInputSchema>

/**
 * `GET /api/builds` (list, auth-required) row shape - enough for an Account
 * page list (name, layout, price, when saved), NOT full line-item/selections
 * detail (that's `GET /api/builds/:id`'s job). `id` here is the
 * `CustomBuild.id` (NOT `SavedBuild.id`) - see shared/README.md for why:
 * it's the SAME id used by `/b/:id` and
 * `GET /api/builds/:id`, so the Account page can link straight into either
 * without a second lookup or a second kind of id to track.
 *
 * `totalPrice` here is the STORED value from `CustomBuild.totalPrice`
 * (validated fresh at save-time, not re-recomputed on every list fetch) -
 * deliberately cheaper than the single-build detail route's always-fresh
 * recompute. See `shared/README.md`'s note on the one documented case where
 * these two can show different numbers for the same build (a catalog change
 * after save).
 */
export const SavedBuildSummarySchema = z.object({
  id: IdSchema,
  label: z.string().min(1),
  layout: BuildLayoutIdSchema,
  totalPrice: CentsSchema,
  createdAt: IsoDateTimeSchema,
})
export type SavedBuildSummary = z.infer<typeof SavedBuildSummarySchema>
