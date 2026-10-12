import { describe, expect, it } from "vitest"
import {
  calculateCartTotals,
  CartItemSnapshotSchema,
  FLAT_SHIPPING_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  TAX_RATE,
  type CartItemSnapshot,
} from "./cart"

/**
 * Fictional demo rules under test (see cart.ts): $150 free-shipping
 * threshold, flat $8 shipping under it, flat 7.25% tax. Not the real
 * checkout pricing engine - a cart-page estimate only.
 */

function item(overrides: Partial<CartItemSnapshot> = {}): CartItemSnapshot {
  return {
    id: "item_1",
    productId: "prod_1",
    variantId: "var_1",
    name: "Test Item",
    quantity: 1,
    unitPrice: 1000,
    lineTotal: 1000,
    ...overrides,
  }
}

describe("calculateCartTotals", () => {
  it("returns all zeros for an empty cart, with the full threshold remaining", () => {
    const totals = calculateCartTotals([])

    expect(totals).toEqual({
      subtotal: 0,
      estimatedShipping: 0,
      estimatedTax: 0,
      freeShippingRemaining: FREE_SHIPPING_THRESHOLD_CENTS,
    })
  })

  it("charges flat shipping and computes tax under the free-shipping threshold", () => {
    const items = [item({ id: "a", lineTotal: 5000, unitPrice: 5000, quantity: 1 })]

    const totals = calculateCartTotals(items)

    expect(totals.subtotal).toBe(5000)
    expect(totals.estimatedShipping).toBe(FLAT_SHIPPING_CENTS)
    expect(totals.estimatedTax).toBe(Math.round(5000 * TAX_RATE))
    expect(totals.freeShippingRemaining).toBe(FREE_SHIPPING_THRESHOLD_CENTS - 5000)
  })

  it("waives shipping once the subtotal meets the free-shipping threshold exactly", () => {
    const items = [
      item({ id: "a", lineTotal: FREE_SHIPPING_THRESHOLD_CENTS, unitPrice: FREE_SHIPPING_THRESHOLD_CENTS }),
    ]

    const totals = calculateCartTotals(items)

    expect(totals.subtotal).toBe(FREE_SHIPPING_THRESHOLD_CENTS)
    expect(totals.estimatedShipping).toBe(0)
    expect(totals.freeShippingRemaining).toBe(0)
  })

  it("waives shipping over the threshold", () => {
    const items = [item({ id: "a", lineTotal: 20000, unitPrice: 20000 })]

    const totals = calculateCartTotals(items)

    expect(totals.estimatedShipping).toBe(0)
    expect(totals.freeShippingRemaining).toBe(0)
    expect(totals.estimatedTax).toBe(Math.round(20000 * TAX_RATE))
  })

  it("sums lineTotal (not unitPrice) across mixed quantities and multiple lines", () => {
    const items = [
      item({ id: "a", unitPrice: 24900, quantity: 1, lineTotal: 24900 }),
      item({ id: "b", unitPrice: 900, quantity: 3, lineTotal: 2700, variantId: "var_2", customBuildId: undefined }),
    ]

    const totals = calculateCartTotals(items)

    expect(totals.subtotal).toBe(24900 + 2700)
    expect(totals.estimatedShipping).toBe(0) // 27600 >= 15000 threshold
    expect(totals.estimatedTax).toBe(Math.round(27600 * TAX_RATE))
    expect(totals.freeShippingRemaining).toBe(0)
  })
})

/**
 * A strict XOR requiring exactly one of variantId/customBuildId would
 * reject the 4 seeded zero-variant products (their cart lines legitimately
 * set neither). See cart.ts's refineNotBothVariantAndBuild doc comment.
 */
describe("CartItemSnapshotSchema variant/build validation", () => {
  it("accepts a line with only variantId set", () => {
    expect(() => CartItemSnapshotSchema.parse(item({ variantId: "var_1", customBuildId: undefined }))).not.toThrow()
  })

  it("accepts a line with only customBuildId set", () => {
    expect(() =>
      CartItemSnapshotSchema.parse(item({ variantId: undefined, customBuildId: "build_1" })),
    ).not.toThrow()
  })

  it("accepts a line with BOTH unset - a direct no-variant product line", () => {
    expect(() =>
      CartItemSnapshotSchema.parse(item({ variantId: undefined, customBuildId: undefined })),
    ).not.toThrow()
  })

  it("rejects a line with BOTH variantId and customBuildId set", () => {
    expect(() => CartItemSnapshotSchema.parse(item({ variantId: "var_1", customBuildId: "build_1" }))).toThrow()
  })
})
