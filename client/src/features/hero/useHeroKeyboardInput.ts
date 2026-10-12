/**
 * Physical + tap keyboard input for the home hero (PROJECT_SPECS.md §4.1:
 * "when the user types on their real keyboard, the matching 3D key presses
 * down and plays the selected switch sound" + mobile "tap keys to press
 * them"). Single state owner for BOTH input sources - `HeroScene.tsx`'s
 * `PressableKeycapLayer` calls the exact same `pressKey`/`releaseKey` this
 * hook's own `keydown`/`keyup` listeners call, so there is one source of
 * truth for "which key is pressed" regardless of whether a real keyboard or
 * a touch tap triggered it.
 *
 * MATCHING RULE: `KeyDef.id` in `lib/catalog/layouts.ts` is already a literal
 * `KeyboardEvent.code` value (deliberate project convention, see that file's
 * doc comment) - so matching is an exact `event.code` -> `KeyDef.id` lookup,
 * no fuzzy/translation table. A physical key with no matching id in the
 * active (possibly reduced, mobile) layout - e.g. `F7` when the hero is
 * showing the 60% layout, which has no function row - simply doesn't match
 * anything and is silently ignored. This is an intentional best-effort
 * match, not a bug: the hero's layout is a visual prop, not a full input
 * surface that needs to accept every possible key.
 *
 * SWITCH FEEL: the hero has no configurator selection to read a feel from,
 * so every key press plays `"tactile"` - picked because it's the most
 * audibly distinctive of the three feels (bump + primary burst, see
 * `switchSynth.ts`) for a first-impression hero moment, a deliberate choice,
 * not a leftover default.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyDef } from "@/lib/catalog/layouts"
import { playSwitchSound } from "@/lib/audio/switchSynth"

const HERO_SWITCH_FEEL = "tactile"

export interface UseHeroKeyboardInputResult {
  /** `KeyDef.id` of the currently-pressed key (physical or tap), or `null`. */
  pressedKeyId: string | null
  /** True once the user has pressed any key at least once - used to dismiss the "Try typing" hint. */
  hasInteracted: boolean
  /** Mobile tap-to-press entry point - `PressableKeycapLayer`'s `onPointerDown` calls this. */
  pressKey: (id: string) => void
  /** Shared release - physical `keyup`, a global `pointerup`/`pointercancel` (drag-off guard), or tap release all call this. */
  releaseKey: () => void
}

/**
 * @param layoutKeys The hero's active layout (device-sized - see `HeroSection.tsx`'s mobile layout pick). Only ids present in this list can match.
 * @param active Gate on listening at all - `HeroSection.tsx` wires this to an `IntersectionObserver`, same pattern as `BuildScene.tsx`'s canvas visibility gating, so typing elsewhere on the page (or scrolled away from the hero) never gets captured.
 */
export function useHeroKeyboardInput(layoutKeys: KeyDef[], active: boolean): UseHeroKeyboardInputResult {
  const [pressedKeyId, setPressedKeyId] = useState<string | null>(null)
  const [hasInteracted, setHasInteracted] = useState(false)
  const pressedKeyIdRef = useRef<string | null>(null)
  // `useMemo`, not a ref mutated during render (oxlint's react(refs) rule
  // correctly flags that pattern) - recomputes only when `layoutKeys`'
  // identity changes (mobile <-> desktop layout swap), read from inside the
  // effect below via its dependency array, not a stale closure.
  const keyIdSet = useMemo(() => new Set(layoutKeys.map((k) => k.id)), [layoutKeys])

  const pressKey = useCallback((id: string) => {
    if (pressedKeyIdRef.current === id) return
    pressedKeyIdRef.current = id
    setPressedKeyId(id)
    setHasInteracted(true)
    playSwitchSound(HERO_SWITCH_FEEL)
  }, [])

  const releaseKey = useCallback(() => {
    if (pressedKeyIdRef.current === null) return
    pressedKeyIdRef.current = null
    setPressedKeyId(null)
  }, [])

  useEffect(() => {
    if (!active) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return
      // Don't hijack typing in a real text field (same guard as `routes/Build.tsx`'s undo/redo listener) - no text input exists in the hero itself, but the header's `/` search command palette is reachable from any page.
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return
      }
      if (!keyIdSet.has(event.code)) return
      pressKey(event.code)
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code !== pressedKeyIdRef.current) return
      releaseKey()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [active, keyIdSet, pressKey, releaseKey])

  // Drag-off guard for mobile tap (same intent as `SwitchPressButton.tsx`'s
  // `setPointerCapture`, implemented at the window level here instead: a 3D
  // instance has no DOM element of its own to capture a pointer on, and a
  // tap that drags off a tiny key before lifting must still release it).
  useEffect(() => {
    window.addEventListener("pointerup", releaseKey)
    window.addEventListener("pointercancel", releaseKey)
    return () => {
      window.removeEventListener("pointerup", releaseKey)
      window.removeEventListener("pointercancel", releaseKey)
    }
  }, [releaseKey])

  return { pressedKeyId, hasInteracted, pressKey, releaseKey }
}
