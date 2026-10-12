import { describe, expect, it } from "vitest"
import { SWITCH_SPECS, SwitchSpecSchema, getSwitchSpecBySlug, type SwitchSpec } from "./switchSpec"

/**
 * Switch detail page contract under test (see switchSpec.ts's doc comment
 * for the full force-curve shape rationale). Parses every entry of
 * `SWITCH_SPECS` against its own Zod schema so a bad seed value (e.g. a
 * forceCurve that doesn't actually end at totalTravelMm) fails a test run,
 * not a live page render.
 */

describe("SWITCH_SPECS", () => {
  it("has exactly 6 entries, one per seeded SWITCH product", () => {
    expect(SWITCH_SPECS).toHaveLength(6)
    expect(SWITCH_SPECS.map((s) => s.productSlug).sort()).toEqual(
      ["arc-clicky", "ember-linear", "glacier-linear", "hearth-tactile", "riot-clicky", "slimline-linear"].sort(),
    )
  })

  it("every entry parses against SwitchSpecSchema", () => {
    for (const spec of SWITCH_SPECS) {
      const result = SwitchSpecSchema.safeParse(spec)
      if (!result.success) {
        throw new Error(`${spec.productSlug} failed SwitchSpecSchema: ${JSON.stringify(result.error.issues)}`)
      }
    }
  })
})

describe("getSwitchSpecBySlug", () => {
  it("returns the matching spec for a real slug", () => {
    const spec = getSwitchSpecBySlug("ember-linear")
    expect(spec?.feel).toBe("linear")
    expect(spec?.actuationForceG).toBe(45)
    expect(spec?.bottomOutForceG).toBe(58)
    expect(spec?.totalTravelMm).toBe(4.0)
  })

  it("returns undefined for an unknown slug", () => {
    expect(getSwitchSpecBySlug("not-a-real-switch")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Shape-distinction tests - confirm linear/tactile/clicky are genuinely
// different curve shapes, not just differently-labeled numbers.
// ---------------------------------------------------------------------------

function hasADrop(spec: SwitchSpec): boolean {
  return spec.forceCurve.some((p, i) => i > 0 && p.forceG < spec.forceCurve[i - 1]!.forceG)
}

/** A point that's a local max (strictly greater than both neighbors) but not the curve's global max. */
function hasNonGlobalLocalMax(spec: SwitchSpec): boolean {
  const globalMax = Math.max(...spec.forceCurve.map((p) => p.forceG))
  return spec.forceCurve.some((p, i) => {
    if (i === 0 || i === spec.forceCurve.length - 1) return false
    const prev = spec.forceCurve[i - 1]!
    const next = spec.forceCurve[i + 1]!
    return p.forceG > prev.forceG && p.forceG > next.forceG && p.forceG < globalMax
  })
}

function isMonotonicNonDecreasing(spec: SwitchSpec): boolean {
  return spec.forceCurve.every((p, i) => i === 0 || p.forceG >= spec.forceCurve[i - 1]!.forceG)
}

function isLocalMax(spec: SwitchSpec, index: number): boolean {
  if (index <= 0 || index >= spec.forceCurve.length - 1) return false
  const p = spec.forceCurve[index]!
  const prev = spec.forceCurve[index - 1]!
  const next = spec.forceCurve[index + 1]!
  return p.forceG > prev.forceG && p.forceG > next.forceG
}

/** Tactile shape: the bump peaks strictly BEFORE preTravelMm, then dips at preTravelMm. */
function peaksBeforeActuation(spec: SwitchSpec): boolean {
  return spec.forceCurve.some((p, i) => p.travelMm < spec.preTravelMm && isLocalMax(spec, i))
}

/** Clicky shape: the point AT preTravelMm is itself the local max (peak right before the snap). */
function peaksAtActuation(spec: SwitchSpec): boolean {
  const i = spec.forceCurve.findIndex((p) => p.travelMm === spec.preTravelMm)
  return i >= 0 && isLocalMax(spec, i)
}

describe("force curve shapes differ by feel", () => {
  const bySlug = (slug: string) => {
    const s = getSwitchSpecBySlug(slug)
    if (!s) throw new Error(`missing fixture spec: ${slug}`)
    return s
  }

  it("linear switches rise smoothly with no drop and no bump", () => {
    for (const spec of SWITCH_SPECS.filter((s) => s.feel === "linear")) {
      expect(isMonotonicNonDecreasing(spec)).toBe(true)
      expect(hasADrop(spec)).toBe(false)
      expect(hasNonGlobalLocalMax(spec)).toBe(false)
    }
  })

  it("tactile switches have a bump that peaks BEFORE preTravelMm, then dips to the actuation force", () => {
    for (const spec of SWITCH_SPECS.filter((s) => s.feel === "tactile")) {
      expect(hasNonGlobalLocalMax(spec)).toBe(true)
      expect(peaksBeforeActuation(spec)).toBe(true)
      expect(peaksAtActuation(spec)).toBe(false)
      expect(isMonotonicNonDecreasing(spec)).toBe(false)
      // The point AT preTravelMm is the dip, landing exactly on actuationForceG.
      const dipPoint = spec.forceCurve.find((p) => p.travelMm === spec.preTravelMm)
      expect(dipPoint?.forceG).toBe(spec.actuationForceG)
    }
  })

  it("clicky switches peak exactly AT preTravelMm, then suddenly drop (the snap)", () => {
    for (const spec of SWITCH_SPECS.filter((s) => s.feel === "clicky")) {
      expect(hasADrop(spec)).toBe(true)
      expect(isMonotonicNonDecreasing(spec)).toBe(false)
      expect(peaksAtActuation(spec)).toBe(true)
      expect(peaksBeforeActuation(spec)).toBe(false)
      // The peak right before the drop lands exactly on the labeled actuation force.
      const peakPoint = spec.forceCurve.find((p) => p.travelMm === spec.preTravelMm)
      expect(peakPoint?.forceG).toBe(spec.actuationForceG)
    }
  })

  it("linear, tactile, and clicky are mutually distinguishable (no two feels share the same shape signature)", () => {
    const signature = (s: SwitchSpec) => `${peaksBeforeActuation(s)}-${peaksAtActuation(s)}-${isMonotonicNonDecreasing(s)}`
    const linearSig = signature(bySlug("ember-linear"))
    const tactileSig = signature(bySlug("hearth-tactile"))
    const clickySig = signature(bySlug("riot-clicky"))

    expect(linearSig).not.toBe(tactileSig)
    expect(linearSig).not.toBe(clickySig)
    expect(tactileSig).not.toBe(clickySig)
  })
})
