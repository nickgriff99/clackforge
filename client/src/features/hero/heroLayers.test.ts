import { describe, expect, it } from "vitest"
import { getActiveHeroLayer, getActiveHeroLayerIndex, HERO_LAYER_IDS } from "./heroLayers"

describe("getActiveHeroLayerIndex", () => {
  it("maps explodeFactor 0 to the first layer (keycaps)", () => {
    expect(getActiveHeroLayerIndex(0)).toBe(0)
  })

  it("maps explodeFactor 1 to the last layer (case), not an out-of-bounds index", () => {
    expect(getActiveHeroLayerIndex(1)).toBe(HERO_LAYER_IDS.length - 1)
  })

  it("buckets into 5 equal ranges in order", () => {
    expect(getActiveHeroLayerIndex(0.05)).toBe(0)
    expect(getActiveHeroLayerIndex(0.25)).toBe(1)
    expect(getActiveHeroLayerIndex(0.45)).toBe(2)
    expect(getActiveHeroLayerIndex(0.65)).toBe(3)
    expect(getActiveHeroLayerIndex(0.85)).toBe(4)
  })

  it("is monotonically non-decreasing as explodeFactor rises", () => {
    let prev = getActiveHeroLayerIndex(0)
    for (let f = 0; f <= 1; f += 0.01) {
      const next = getActiveHeroLayerIndex(f)
      expect(next).toBeGreaterThanOrEqual(prev)
      prev = next
    }
  })

  it("clamps out-of-range input instead of throwing or going out of bounds", () => {
    expect(getActiveHeroLayerIndex(-0.5)).toBe(0)
    expect(getActiveHeroLayerIndex(1.5)).toBe(HERO_LAYER_IDS.length - 1)
  })
})

describe("getActiveHeroLayer", () => {
  it("returns a layer whose id matches HERO_LAYER_IDS at the same index", () => {
    for (const f of [0, 0.3, 0.5, 0.9, 1]) {
      const layer = getActiveHeroLayer(f)
      expect(layer.id).toBe(HERO_LAYER_IDS[getActiveHeroLayerIndex(f)])
    }
  })

  it("every layer has a non-empty label and fact (no placeholder copy)", () => {
    for (const f of [0, 0.2, 0.4, 0.6, 0.8]) {
      const layer = getActiveHeroLayer(f)
      expect(layer.label.length).toBeGreaterThan(0)
      expect(layer.fact.length).toBeGreaterThan(10)
    }
  })
})
