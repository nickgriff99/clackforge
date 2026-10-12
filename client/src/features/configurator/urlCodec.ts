import {
  BuildAccentKeysSchema,
  BuildLayoutIdSchema,
  BuildSelectionsSchema,
  BuildSlotSchema,
  CURRENT_BUILD_CONFIG_VERSION,
  type BuildAccentKeys,
  type BuildLayoutId,
  type BuildSelections,
} from "@shared"

/**
 * URL state codec for the configurator: config serializes to a compact,
 * versioned URL param so any build is shareable and survives refresh.
 * Invalid/old URLs fall back gracefully with a toast.
 *
 * Format, and why "compact" means this and not
 * `encodeURIComponent(JSON.stringify(...))`: a raw JSON blob repeats every
 * field name ("selections", "caseMaterial", "artisanKeycap", ...) on every
 * single encode, which is pure overhead - those names are already fixed
 * by `BuildSlotSchema`, so the URL doesn't need to spell them out again.
 * This codec instead packs values only, positionally, in
 * `BuildSlotSchema`'s own canonical slot order (the single source of
 * truth for that order, not a second hand-copied list), then
 * base64url-encodes the whole thing so it's one opaque, URL-safe token
 * with no percent-encoding noise from the delimiter characters:
 *
 *   "{version}~{layout}~{selections, comma-joined, canonical slot order, empty token = unset}~{accentKeys, `key=value` pairs joined by ';'}"
 *   -> base64url
 *
 * This isn't over-engineered further (no varint packing, no per-catalog
 * index table trading size for fragility - see the rejected alternative
 * below) because option ids are already short, stable, kebab-case strings
 * and there are only 9 slots; positional+delimited gets most of the
 * compactness win for near-zero complexity.
 *
 * Rejected alternative: encoding each selection as an index into
 * `CONFIGURATOR_OPTIONS` instead of its id string. Rejected because
 * adding a new case color must only require editing data, not touching
 * this codec - an index-based codec would make every previously shared
 * URL's meaning depend on catalog array order, so inserting a new option
 * anywhere but the very end of its slot's definitions would silently
 * re-point old links at the wrong option. Ids are stable; array positions
 * are not a contract. Not worth the extra few bytes.
 *
 * Delimiter safety: every catalog option id (`shared/src/options.ts`) is
 * kebab-case ASCII and every accent-key id is a `KeyboardEvent.code`
 * value (also plain ASCII, e.g. "KeyQ") - neither alphabet contains `~`,
 * `,`, `;`, or `=`, so no production value can collide with a delimiter
 * today. `escapeSegment`/`unescapeSegment` below are a defensive seam
 * anyway (a couple of lines, not a new encoding scheme) so a future
 * catalog id typo corrupts nothing instead of silently breaking
 * round-trips.
 *
 * Versioning: the packed string's first field is always `BuildConfig`'s
 * `version` (`CURRENT_BUILD_CONFIG_VERSION`, see `shared/src/build.ts`).
 * `decodeBuildState` reads and validates that field before assuming
 * anything about the rest of the string's shape, so a version this codec
 * doesn't recognize fails as `"version-unsupported"` even if the
 * remaining fields are structured completely differently (a real
 * concern - a future v2 is free to add/reorder/split fields, e.g. if
 * `accentKeys` ever needed two sub-parts). There is only one version
 * today (`1`), so there's nothing to migrate yet - this is the documented
 * seam for when that changes:
 *
 *   Future migration seam: when `CURRENT_BUILD_CONFIG_VERSION` bumps to 2
 *   in `shared/src/build.ts`, add a `parseV1(parts: string[]): DecodedState
 *   | null` branch here (the current v1 parsing logic below, renamed and
 *   kept verbatim) plus a new `parseV2`, then in `decodeBuildState`
 *   dispatch on the parsed `version` field to whichever parser applies,
 *   migrating a recognized old version's shape forward into v2's
 *   `ConfiguratorUrlState` shape rather than rejecting it. Only versions
 *   with no parser registered (too old and removed, or too new - e.g.
 *   this exact codebase seeing a `version: 2` string) return
 *   `"version-unsupported"`.
 */

/** The `/build` route's URL search param name - one place other call sites (e.g. a future "copy share link" button) read from, instead of a hand-typed `"b"` string. */
export const BUILD_URL_PARAM = "b"

export interface ConfiguratorUrlState {
  layout: BuildLayoutId
  selections: BuildSelections
  accentKeys: BuildAccentKeys
}

export type DecodeBuildStateResult =
  | { ok: true; state: ConfiguratorUrlState }
  | { ok: false; reason: "malformed" | "version-unsupported"; message: string }

const FIELD_DELIMITER = "~"
const SELECTION_DELIMITER = ","
const ACCENT_PAIR_DELIMITER = ";"
const ACCENT_KV_DELIMITER = "="

/** Canonical, schema-owned slot order - never hand-duplicated. */
const SLOT_ORDER = BuildSlotSchema.options

function malformed(): DecodeBuildStateResult {
  return {
    ok: false,
    reason: "malformed",
    message: "This build link looks invalid and can't be opened. Showing the default configurator instead.",
  }
}

function versionUnsupported(): DecodeBuildStateResult {
  return {
    ok: false,
    reason: "version-unsupported",
    message:
      "This build link is from a version of the configurator this page doesn't recognize and can't be opened. Showing the default configurator instead.",
  }
}

function escapeSegment(value: string): string {
  return value.replace(/[~,;=]/g, (ch) => `%${ch.charCodeAt(0).toString(16)}`)
}

function unescapeSegment(value: string): string {
  return value.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}

function toBase64Url(input: string): string {
  const base64 = btoa(input)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(input: string): string | null {
  try {
    const padLength = (4 - (input.length % 4)) % 4
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength)
    return atob(base64)
  } catch {
    return null
  }
}

/** Pack (pre-base64) form - exported only for the test suite's direct coverage of the delimiter format. */
export function packBuildState(state: ConfiguratorUrlState): string {
  const selectionsPart = SLOT_ORDER.map((slot) => escapeSegment(state.selections[slot] ?? "")).join(
    SELECTION_DELIMITER,
  )
  const accentPart = Object.entries(state.accentKeys)
    .map(([key, value]) => `${escapeSegment(key)}${ACCENT_KV_DELIMITER}${escapeSegment(value)}`)
    .join(ACCENT_PAIR_DELIMITER)

  return [String(CURRENT_BUILD_CONFIG_VERSION), escapeSegment(state.layout), selectionsPart, accentPart].join(
    FIELD_DELIMITER,
  )
}

/** Inverse of `packBuildState` for the CURRENT version only - see the "FUTURE MIGRATION SEAM" doc above. */
function unpackV1(parts: string[]): DecodeBuildStateResult {
  if (parts.length !== 4) return malformed()
  const [, layoutPart, selectionsPart, accentPart] = parts

  const layoutResult = BuildLayoutIdSchema.safeParse(unescapeSegment(layoutPart ?? ""))
  if (!layoutResult.success) return malformed()

  const selectionTokens = (selectionsPart ?? "").split(SELECTION_DELIMITER)
  if (selectionTokens.length !== SLOT_ORDER.length) return malformed()

  const selections: BuildSelections = {}
  for (let i = 0; i < SLOT_ORDER.length; i++) {
    const token = unescapeSegment(selectionTokens[i] ?? "")
    if (token !== "") selections[SLOT_ORDER[i]!] = token
  }
  const selectionsResult = BuildSelectionsSchema.safeParse(selections)
  if (!selectionsResult.success) return malformed()

  const accentKeys: BuildAccentKeys = {}
  if (accentPart) {
    for (const pair of accentPart.split(ACCENT_PAIR_DELIMITER)) {
      if (pair === "") continue
      const eqIndex = pair.indexOf(ACCENT_KV_DELIMITER)
      if (eqIndex <= 0 || eqIndex === pair.length - 1) return malformed()
      const key = unescapeSegment(pair.slice(0, eqIndex))
      const value = unescapeSegment(pair.slice(eqIndex + 1))
      accentKeys[key] = value
    }
  }
  const accentResult = BuildAccentKeysSchema.safeParse(accentKeys)
  if (!accentResult.success) return malformed()

  return {
    ok: true,
    state: { layout: layoutResult.data, selections: selectionsResult.data, accentKeys: accentResult.data },
  }
}

/** Unpack (pre-base64) form - exported only for the test suite's direct coverage of the delimiter format. */
export function unpackBuildState(raw: string): DecodeBuildStateResult {
  const parts = raw.split(FIELD_DELIMITER)
  const versionPart = parts[0]
  const version = Number(versionPart)
  if (versionPart === undefined || versionPart === "" || !Number.isInteger(version) || version < 1) {
    return malformed()
  }
  if (version !== CURRENT_BUILD_CONFIG_VERSION) {
    // Only version 1 exists today. See "Future migration seam" doc above
    // - this is where a recognized old version would get migrated
    // forward instead of rejected.
    return versionUnsupported()
  }
  return unpackV1(parts)
}

/** Encode configurator state into the `?b=` URL param value. Never throws. */
export function encodeBuildState(state: ConfiguratorUrlState): string {
  return toBase64Url(packBuildState(state))
}

/**
 * Decode a `?b=` URL param value back into configurator state. Never
 * throws - every failure mode (malformed base64, wrong field count, a
 * version this codec doesn't recognize, an option id that doesn't match
 * `BuildSelectionsSchema`'s shape) returns `{ ok: false, reason, message }`
 * with a user-facing `message` ready to hand straight to a toast. Callers
 * must fall back to the default configurator state on `ok: false` - this
 * function never partially hydrates.
 */
export function decodeBuildState(encoded: string): DecodeBuildStateResult {
  const raw = fromBase64Url(encoded)
  if (raw === null) return malformed()
  return unpackBuildState(raw)
}
