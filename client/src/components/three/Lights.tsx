/**
 * Lighting rig: a soft hemisphere fill so dark materials never fall into
 * pure black, a warm key light, a cool fill, and cyan and amber rim lights
 * from behind that separate the keyboard from the dark page. No HDRI and no
 * shadow maps, so it stays cheap on mobile. Adaptive quality
 * (`PerformanceMonitor`) layers on top of this.
 */
import { BRAND_HEX } from "./materials"

export function Lights() {
  return (
    <>
      <hemisphereLight args={["#dbe6ff", "#2a2f3a", 0.9]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 4]} intensity={1.7} color="#fff3e6" />
      <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#bcd0ff" />
      <directionalLight position={[0, 4, -6]} intensity={1.4} color={BRAND_HEX.switchLedCyan} />
      <directionalLight position={[5, 2, -5]} intensity={0.9} color={BRAND_HEX.forgeAmber} />
    </>
  )
}
