// @vitest-environment jsdom
/**
 * Covers what `heroLayers.test.ts` doesn't: the exact-match keydown/keyup
 * rules and the `active` (IntersectionObserver-driven) gate documented in
 * `useHeroKeyboardInput.ts`'s own doc comment. `playSwitchSound` is a real
 * (non-mocked) call here - under jsdom `AudioContext` doesn't exist, so
 * `lib/audio/switchSynth.ts` silently no-ops (see that file's doc comment);
 * nothing here asserts on sound playback.
 */
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { KeyDef } from "@/lib/catalog/layouts"
import { useHeroKeyboardInput } from "./useHeroKeyboardInput"

function key(id: string): KeyDef {
  return { id, label: id, x: 0, y: 0, width: 1, height: 1, row: 0 }
}

const LAYOUT_KEYS: KeyDef[] = [key("KeyQ"), key("Space"), key("ArrowUp")]

function dispatchKeyDown(code: string, extra: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, ...extra }))
}

function dispatchKeyUp(code: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }))
}

afterEach(() => {
  // Clear any un-released key / listeners between tests (hooks unmount via
  // renderHook's own cleanup, but belt-and-suspenders for window-level state).
  dispatchKeyUp("KeyQ")
  dispatchKeyUp("Space")
  dispatchKeyUp("ArrowUp")
})

describe("useHeroKeyboardInput", () => {
  it("starts with no key pressed and no interaction recorded", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    expect(result.current.pressedKeyId).toBeNull()
    expect(result.current.hasInteracted).toBe(false)
  })

  it("presses a key on an exact event.code match while active", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => dispatchKeyDown("KeyQ"))
    expect(result.current.pressedKeyId).toBe("KeyQ")
    expect(result.current.hasInteracted).toBe(true)
  })

  it("ignores a physical key with no id in the active layout (e.g. F7 on a reduced layout)", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => dispatchKeyDown("F7"))
    expect(result.current.pressedKeyId).toBeNull()
    expect(result.current.hasInteracted).toBe(false)
  })

  it("does not listen at all while inactive (IntersectionObserver-gated)", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, false))
    act(() => dispatchKeyDown("KeyQ"))
    expect(result.current.pressedKeyId).toBeNull()
    expect(result.current.hasInteracted).toBe(false)
  })

  it("stops listening the moment `active` flips false (scrolled out of view mid-session)", () => {
    const { result, rerender } = renderHook(({ active }) => useHeroKeyboardInput(LAYOUT_KEYS, active), {
      initialProps: { active: true },
    })
    act(() => dispatchKeyDown("KeyQ"))
    expect(result.current.pressedKeyId).toBe("KeyQ")

    act(() => dispatchKeyUp("KeyQ"))
    rerender({ active: false })

    act(() => dispatchKeyDown("Space"))
    expect(result.current.pressedKeyId).toBeNull()
  })

  it("ignores event.repeat (held-down auto-repeat should not re-trigger press)", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => dispatchKeyDown("KeyQ"))
    expect(result.current.pressedKeyId).toBe("KeyQ")
    act(() => dispatchKeyDown("KeyQ", { repeat: true }))
    // Still just "pressed", not re-triggered/toggled off by the repeat.
    expect(result.current.pressedKeyId).toBe("KeyQ")
  })

  it("ignores keydown while focus is in a real text field (command palette guard)", () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    // Dispatch ON the input (not window) so `event.target` is the input
    // element itself - the bubble-up to the hook's `window` listener is what
    // exercises the real guard path.
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true })))
    expect(result.current.pressedKeyId).toBeNull()
    document.body.removeChild(input)
  })

  it("releases on a matching keyup", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => dispatchKeyDown("KeyQ"))
    act(() => dispatchKeyUp("KeyQ"))
    expect(result.current.pressedKeyId).toBeNull()
  })

  it("ignores a keyup for a different code than the currently-pressed key", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => dispatchKeyDown("KeyQ"))
    act(() => dispatchKeyUp("Space"))
    expect(result.current.pressedKeyId).toBe("KeyQ")
  })

  it("releases on a global pointerup (mobile tap drag-off guard)", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => result.current.pressKey("Space"))
    expect(result.current.pressedKeyId).toBe("Space")
    act(() => window.dispatchEvent(new Event("pointerup")))
    expect(result.current.pressedKeyId).toBeNull()
  })

  it("releases on a global pointercancel", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => result.current.pressKey("Space"))
    act(() => window.dispatchEvent(new Event("pointercancel")))
    expect(result.current.pressedKeyId).toBeNull()
  })

  it("re-derives the matchable key set when layoutKeys changes identity (mobile <-> desktop swap)", () => {
    const { result, rerender } = renderHook(({ keys }) => useHeroKeyboardInput(keys, true), {
      initialProps: { keys: LAYOUT_KEYS },
    })
    act(() => dispatchKeyDown("ArrowUp"))
    expect(result.current.pressedKeyId).toBe("ArrowUp")
    act(() => dispatchKeyUp("ArrowUp"))

    const smallerLayout: KeyDef[] = [key("KeyQ")]
    rerender({ keys: smallerLayout })

    act(() => dispatchKeyDown("ArrowUp"))
    expect(result.current.pressedKeyId).toBeNull()
  })

  it("pressKey is idempotent for the same id already pressed (no duplicate sound-trigger state thrash)", () => {
    const { result } = renderHook(() => useHeroKeyboardInput(LAYOUT_KEYS, true))
    act(() => result.current.pressKey("KeyQ"))
    const firstPressedId = result.current.pressedKeyId
    act(() => result.current.pressKey("KeyQ"))
    expect(result.current.pressedKeyId).toBe(firstPressedId)
  })
})
