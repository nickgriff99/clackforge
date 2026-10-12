/**
 * Single source of truth for 3D material colors - don't scatter hex codes
 * across `components/three` files.
 *
 * three.js materials need literal sRGB values - they cannot consume the
 * app's CSS custom properties (OKLCH tokens defined in `client/src/index.css`
 * per `BRAND.md`). These hexes are the sRGB conversion of this project's dark
 * theme (the default brand surface per BRAND.md - "the workshop at night")
 * OKLCH tokens, computed once and pinned here so every `components/three`
 * file imports from this module instead of inlining its own hex.
 *
 * If `client/src/index.css` tokens change, regenerate these (OKLCH -> sRGB,
 * D65, same formula as `culori`/CSS Color 4) and update the comment below.
 *
 * Source tokens (client/src/index.css `:root`, dark theme):
 *   --background oklch(0.16 0.012 265) -> #0b0d13
 *   --card       oklch(0.21 0.014 265) -> #15181f
 *   --secondary  oklch(0.29 0.012 265) -> #282b31
 *   --muted      oklch(0.26 0.012 265) -> #21242a  (case/plate neutral)
 *   --foreground oklch(0.96 0.004 265) -> #f0f2f4  (legend/off-white)
 *   --primary    oklch(0.74 0.17 55)   -> #fa8927  (forge amber accent)
 *   --accent     oklch(0.74 0.12 205)  -> #26c0cf  (switch-LED cyan accent)
 */
import * as THREE from "three"

export const BRAND_HEX = {
  caseGraphiteDark: "#0b0d13",
  caseGraphiteMid: "#15181f",
  plateGraphite: "#282b31",
  keycapNeutral: "#21242a",
  legendOffWhite: "#f0f2f4",
  forgeAmber: "#fa8927",
  switchLedCyan: "#26c0cf",
} as const

/**
 * Shared materials - created once at module scope and reused across every
 * instance (never recreated per-key). Safe to import into multiple
 * components; three.js materials are plain disposable objects, not React
 * state, so a module-level singleton is the correct pattern here.
 */
export const materials = {
  /**
   * The default case, plate and keycap tones are lifted a step above the
   * page-background graphite on purpose: against the dark card surface the
   * pure token values read as a black silhouette with no visible keys.
   */
  case: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#414856"),
    roughness: 0.42,
    metalness: 0.55,
  }),
  plate: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#4a515e"),
    roughness: 0.4,
    metalness: 0.5,
  }),
  keycap: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#5d6575"),
    roughness: 0.55,
    metalness: 0.05,
  }),
  keycapAccent: new THREE.MeshStandardMaterial({
    color: new THREE.Color(BRAND_HEX.forgeAmber),
    roughness: 0.6,
    metalness: 0.1,
  }),
  switchHousing: new THREE.MeshStandardMaterial({
    color: new THREE.Color(BRAND_HEX.caseGraphiteMid),
    roughness: 0.5,
    metalness: 0.2,
  }),
  switchStem: new THREE.MeshStandardMaterial({
    color: new THREE.Color(BRAND_HEX.switchLedCyan),
    roughness: 0.3,
    metalness: 0.1,
    emissive: new THREE.Color(BRAND_HEX.switchLedCyan),
    emissiveIntensity: 0.25,
  }),
  /**
   * Plain steel-spring grey, not derived from `BRAND_HEX`: every other
   * entry above is a theme-token conversion (see this file's header doc),
   * but a coil spring is a real-world metal part with no corresponding UI
   * color token to stay in sync with - pinning a literal hex here is
   * correct, not a shortcut.
   */
  switchSpring: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#9aa0a6"),
    roughness: 0.35,
    metalness: 0.75,
  }),
  /**
   * Same "real-world part, not a UI token" reasoning as `switchSpring`
   * above: a PCB's classic soldermask green has no corresponding
   * brand/CSS token to stay in sync with, so a literal hex is correct
   * here, not a shortcut.
   */
  pcb: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#0f3d2e"),
    roughness: 0.6,
    metalness: 0.1,
  }),
  /** PCB standoffs / plate screw posts - a dull metal accent distinct from `switchStem`'s glowing cyan. */
  hardware: new THREE.MeshStandardMaterial({
    color: new THREE.Color("#4a4f57"),
    roughness: 0.4,
    metalness: 0.6,
  }),
} as const
