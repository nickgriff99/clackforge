import { describe, expect, it } from "vitest"
import { BuildSlotSchema, CURRENT_BUILD_CONFIG_VERSION, type BuildSelections } from "@shared"
import { decodeBuildState, encodeBuildState, type ConfiguratorUrlState } from "./urlCodec"

/** 9 empty selection tokens, joined - matches `BuildSlotSchema.options.length`, not a hand-counted comma string. */
const EMPTY_SELECTIONS_SEGMENT = BuildSlotSchema.options.map(() => "").join(",")

function toParam(raw: string): string {
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * PROJECT_SPECS.md §9: "Unit (Vitest): ... URL codec (round-trip + old
 * version migration)." See `urlCodec.ts`'s own doc comment for the full
 * format rationale and the "FUTURE MIGRATION SEAM" this suite's
 * version-mismatch case exercises.
 */

function state(overrides: Partial<ConfiguratorUrlState> = {}): ConfiguratorUrlState {
  const selections: BuildSelections = {
    caseMaterial: "case-mat-aluminum",
    caseColor: "case-col-graphite",
    caseFinish: "case-fin-matte",
    plate: "plate-aluminum",
    switches: "switch-ember-linear",
    keycaps: "keycap-signal-full",
    stabilizers: "stab-stock",
  }
  return { layout: "tkl", selections, accentKeys: {}, ...overrides }
}

describe("encodeBuildState / decodeBuildState round-trip", () => {
  it("round-trips a fully-decked-out build", () => {
    const original = state({
      selections: {
        caseMaterial: "case-mat-aluminum",
        caseColor: "case-col-graphite",
        caseFinish: "case-fin-matte",
        plate: "plate-aluminum",
        switches: "switch-ember-linear",
        keycaps: "keycap-signal-full",
        stabilizers: "stab-tuned",
        cable: "cable-graphite",
        artisanKeycap: "artisan-forge-rivet",
      },
    })

    const encoded = encodeBuildState(original)
    const result = decodeBuildState(encoded)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.state).toEqual(original)
  })

  it("round-trips a fresh/default build (empty selections, no accent keys)", () => {
    const original: ConfiguratorUrlState = { layout: "60", selections: {}, accentKeys: {} }

    const result = decodeBuildState(encodeBuildState(original))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.state).toEqual(original)
  })

  it("round-trips a partial build (some slots unset)", () => {
    const original = state({ selections: { caseMaterial: "case-mat-walnut", switches: "switch-hearth-tactile" } })

    const result = decodeBuildState(encodeBuildState(original))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.state).toEqual(original)
  })

  it("round-trips accent keys", () => {
    const original = state({
      accentKeys: { Escape: "case-col-forge-amber", Enter: "case-col-switch-cyan" },
    })

    const result = decodeBuildState(encodeBuildState(original))

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.state).toEqual(original)
  })
})

describe("decodeBuildState: malformed input", () => {
  it("fails gracefully on a deliberately malformed string (not valid base64url)", () => {
    const result = decodeBuildState("!!!not-a-real-token!!!")

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("malformed")
    expect(result.message).toMatch(/invalid/i)
  })

  it("fails gracefully on valid base64url that decodes to garbage structure", () => {
    // btoa("hello world") decodes to plain text with none of the codec's
    // delimiters in the expected places - exercises the "valid base64, bad
    // shape" path distinctly from "not base64 at all" above.
    const result = decodeBuildState(toParam("hello world"))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("malformed")
  })

  it("fails gracefully when the layout field doesn't match the schema (empty-string layout)", () => {
    const raw = `${CURRENT_BUILD_CONFIG_VERSION}~~${EMPTY_SELECTIONS_SEGMENT}~`

    const result = decodeBuildState(toParam(raw))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("malformed")
  })

  it("fails gracefully when the selections segment has the wrong token count", () => {
    const raw = `${CURRENT_BUILD_CONFIG_VERSION}~tkl~too,few,tokens~`

    const result = decodeBuildState(toParam(raw))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("malformed")
  })
})

describe("decodeBuildState: version handling", () => {
  it("fails gracefully (not a crash) on a string from a version this codec doesn't recognize", () => {
    // Simulates the realistic case given only version 1 exists today: a
    // hypothetical future `version: 2` link opened in THIS (v1-only)
    // codebase - exactly the scenario a real v1 -> v2 bump would produce for
    // anyone with an old tab/bookmark pointed at the new site. See
    // `urlCodec.ts`'s "FUTURE MIGRATION SEAM" doc comment for how a v2
    // codec would instead migrate this forward rather than reject it.
    const futureVersion = CURRENT_BUILD_CONFIG_VERSION + 1
    const raw = `${futureVersion}~tkl~${EMPTY_SELECTIONS_SEGMENT}~`

    const result = decodeBuildState(toParam(raw))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("version-unsupported")
    expect(result.message).toMatch(/version/i)
  })

  it("fails gracefully on a non-numeric/garbage version field", () => {
    const raw = `not-a-version~tkl~${EMPTY_SELECTIONS_SEGMENT}~`

    const result = decodeBuildState(toParam(raw))

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.reason).toBe("malformed")
  })

  it("accepts the current version explicitly (sanity check alongside the round-trip tests)", () => {
    const raw = `${CURRENT_BUILD_CONFIG_VERSION}~tkl~${EMPTY_SELECTIONS_SEGMENT}~`

    const result = decodeBuildState(toParam(raw))

    expect(result.ok).toBe(true)
  })
})
