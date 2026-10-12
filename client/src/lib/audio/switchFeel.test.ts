import { describe, expect, it } from "vitest"
import { SWITCH_OPTIONS } from "@shared"
import { DEFAULT_SWITCH_FEEL, getSwitchFeelForOptionId } from "./switchFeel"

describe("getSwitchFeelForOptionId", () => {
  it("maps every real switch catalog option to a feel", () => {
    // Guards against the catalog gaining a 7th switch option this map
    // silently falls back to DEFAULT_SWITCH_FEEL for - every id in
    // `shared/src/options.ts`'s SWITCH_OPTIONS should round-trip to a
    // believably-named feel per its own label, not just "not crash".
    const expected: Record<string, ReturnType<typeof getSwitchFeelForOptionId>> = {
      "switch-ember-linear": "linear",
      "switch-glacier-linear": "linear",
      "switch-slimline-linear": "linear",
      "switch-hearth-tactile": "tactile",
      "switch-riot-clicky": "clicky",
      "switch-arc-clicky": "clicky",
    }

    expect(SWITCH_OPTIONS.map((o) => o.id).sort()).toEqual(Object.keys(expected).sort())

    for (const option of SWITCH_OPTIONS) {
      expect(getSwitchFeelForOptionId(option.id)).toBe(expected[option.id])
      // Sanity check against the option's own label text, independent of
      // this test's own `expected` map - the label says what the feel is.
      const labelFeel = option.label.toLowerCase()
      expect(labelFeel.includes(getSwitchFeelForOptionId(option.id))).toBe(true)
    }
  })

  it("defaults to linear for no selection", () => {
    expect(getSwitchFeelForOptionId(undefined)).toBe(DEFAULT_SWITCH_FEEL)
  })

  it("defaults to linear for an unknown/future option id rather than throwing", () => {
    expect(getSwitchFeelForOptionId("switch-not-in-the-catalog-yet")).toBe(DEFAULT_SWITCH_FEEL)
  })
})
