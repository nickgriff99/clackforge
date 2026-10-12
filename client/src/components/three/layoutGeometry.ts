/**
 * Shared layout -> world-space transform used by both `Keycap` and `Switch`
 * so the two instanced layers line up exactly without duplicating the
 * centering math in each component.
 */
import { type KeyDef, getLayoutBounds } from "@/lib/catalog/layouts"

export interface KeyWorldTransform {
  key: KeyDef
  /** World-space [x, z] center - the layout is centered at the origin on the XZ (floor) plane. */
  center: [number, number]
}

/** Converts a layout's key list (u units, y-down) into origin-centered world-space centers. */
export function layoutToWorld(keys: KeyDef[]): KeyWorldTransform[] {
  const { width, depth } = getLayoutBounds(keys)
  const originX = width / 2
  const originZ = depth / 2
  return keys.map((key) => ({
    key,
    center: [key.x + key.width / 2 - originX, key.y + key.height / 2 - originZ],
  }))
}
