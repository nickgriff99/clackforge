import { describe, expect, it } from "vitest"
import { CURRENT_BUILD_CONFIG_VERSION, type BuildConfig } from "./build"
import { DEFAULT_CATALOG, calculatePrice, type BuildBasePrice } from "./pricing"

/**
 * Pricing engine under test (see pricing.ts for the full error-handling
 * contract rationale). Uses `DEFAULT_CATALOG` - the real, production option
 * catalog + compatibility rules - rather than fixtures, so these tests also
 * double as a smoke test that the catalog/rule data itself is internally
 * consistent (e.g. every referenced option id actually exists).
 */

const BASE_PRICE: BuildBasePrice = { productId: "prod_anvil65", priceCents: 24900 }

function config(overrides: Partial<BuildConfig> = {}): BuildConfig {
  return {
    version: CURRENT_BUILD_CONFIG_VERSION,
    productId: "prod_anvil65",
    layout: "65",
    selections: {},
    accentKeys: {},
    totalPrice: 0,
    ...overrides,
  }
}

describe("calculatePrice", () => {
  it("prices a base/no-options build as just the base kit line", () => {
    const result = calculatePrice(config(), DEFAULT_CATALOG, BASE_PRICE)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.lineItems).toEqual([{ slot: "base", optionId: null, label: "Base kit (65%)", priceCents: 24900 }])
    expect(result.subtotal).toBe(24900)
  })

  it("prices a partial build with only one slot selected (missing-selection case)", () => {
    const result = calculatePrice(
      config({ selections: { caseMaterial: "case-mat-aluminum" } }),
      DEFAULT_CATALOG,
      BASE_PRICE,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    expect(result.lineItems).toHaveLength(2)
    expect(result.subtotal).toBe(24900 + 0) // case-mat-aluminum is a $0 delta
  })

  it("prices a fully-decked-out build as base + every selected option's delta", () => {
    const fullSelections = {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-forge-amber",
      caseFinish: "case-fin-anodized",
      plate: "plate-fr4",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-full",
      stabilizers: "stab-tuned",
      cable: "cable-forge-amber",
      artisanKeycap: "artisan-anvil-mark",
    } as const

    const result = calculatePrice(config({ selections: fullSelections }), DEFAULT_CATALOG, BASE_PRICE)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    // base + 9 selected options
    expect(result.lineItems).toHaveLength(10)
    const expectedSubtotal =
      24900 + // base
      0 + // case-mat-aluminum
      1000 + // case-col-forge-amber
      0 + // case-fin-anodized (valid: material is aluminum)
      500 + // plate-fr4
      6300 + // switch-ember-linear
      11100 + // keycap-signal-full
      1800 + // stab-tuned
      500 + // cable-forge-amber
      2200 // artisan-anvil-mark
    expect(result.subtotal).toBe(expectedSubtotal)
  })

  it("rejects an incompatible selection (wood case forced into an anodized finish) without pricing anything", () => {
    const result = calculatePrice(
      config({ selections: { caseMaterial: "case-mat-walnut", caseFinish: "case-fin-anodized" } }),
      DEFAULT_CATALOG,
      BASE_PRICE,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("INCOMPATIBLE_SELECTION")
    expect(result.error.message).toMatch(/aluminum/i)
  })

  it("rejects a keycap set that doesn't support the chosen layout", () => {
    const result = calculatePrice(
      config({ layout: "tkl", selections: { keycaps: "keycap-midnight-spherical" } }),
      DEFAULT_CATALOG,
      BASE_PRICE,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("INCOMPATIBLE_SELECTION")
    expect(result.error.message).toMatch(/function-row/i)
  })

  it("rejects an unknown/forged option id for a slot", () => {
    const result = calculatePrice(
      config({ selections: { switches: "switch-does-not-exist" } }),
      DEFAULT_CATALOG,
      BASE_PRICE,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("UNKNOWN_OPTION")
  })

  it("rejects a version mismatch without attempting to migrate", () => {
    const result = calculatePrice(config({ version: CURRENT_BUILD_CONFIG_VERSION + 1 }), DEFAULT_CATALOG, BASE_PRICE)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("VERSION_UNSUPPORTED")
  })

  it("rejects a basePrice argument for the wrong product (defensive caller-bug guard)", () => {
    const result = calculatePrice(config(), DEFAULT_CATALOG, { productId: "prod_some_other_kit", priceCents: 1 })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("PRODUCT_MISMATCH")
  })

  it("rejects an unrecognized layout id", () => {
    const result = calculatePrice(config({ layout: "80" as unknown as BuildConfig["layout"] }), DEFAULT_CATALOG, BASE_PRICE)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected error result")
    expect(result.error.code).toBe("UNKNOWN_LAYOUT")
  })
})
