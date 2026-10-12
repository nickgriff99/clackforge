/**
 * Cheap canvas-context probe for WebGL availability (PROJECT_SPECS.md §4.6:
 * "Fallback: if WebGL is unavailable ... show a 2D ... configurator that
 * still works fully"). Neither `three`, `@react-three/fiber`, nor
 * `@react-three/drei` ship a detection helper (checked `node_modules` -
 * nothing exported for this), so this is the standard ~10-line pattern:
 * try to acquire a WebGL2 or WebGL1 context on a throwaway canvas that is
 * never attached to the DOM, then let it get garbage-collected.
 *
 * Deliberately synchronous and side-effect-free so a call site can decide
 * whether to even attempt `React.lazy()`-loading the three.js chunk
 * *before* requesting it - no wasted network/CPU on a device that could
 * never render the result anyway. See `components/three/BuildCanvasHost.tsx`.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false

  try {
    const canvas = document.createElement("canvas")
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      // Older browsers only exposed this prefixed name; still worth trying.
      canvas.getContext("experimental-webgl")
    return gl != null
  } catch {
    // Some browsers throw instead of returning null when WebGL is blocked
    // (e.g. disabled via flag, or a hardware-blocklisted GPU).
    return false
  }
}
