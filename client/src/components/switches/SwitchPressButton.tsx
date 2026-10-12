/**
 * Real, always-rendered `<button>` - works even when
 * `SwitchDetailCanvasHost` is permanently stuck on the WebGL-unavailable
 * poster, since this element has no dependency on the 3D scene existing at
 * all. Keyboard-operable: pointerdown/up and keydown/up on Enter/Space
 * both drive the exact same `press()`/`release()` pair, so a mouse user
 * and a keyboard user produce identical `onPressedChange`/sound behavior.
 *
 * Stuck-pressed guards:
 * - `setPointerCapture` on pointerdown - without it, dragging the pointer off
 *   the button before releasing fires `pointerup` wherever the pointer
 *   ended up, NOT on this element, so this button would never see the
 *   release and would stay "pressed" forever. Capturing the pointer routes
 *   `pointerup`/`pointercancel` back to this element regardless of where the
 *   release happens.
 * - `onPointerCancel` - covers a browser-cancelled gesture (e.g. a touch
 *   interrupted by a system scroll) that never delivers a normal `pointerup`.
 * - `onBlur` - covers the keyboard case: Enter/Space held down (`press()`
 *   already fired), then focus leaves the button (tab-away, window
 *   blur) before `keyup` ever arrives.
 * - `event.repeat` guard on `keydown` - holding a key fires `keydown`
 *   repeatedly; only the FIRST one should trigger `press()`/the sound.
 *
 * Sound is routed through the existing `playSwitchSound()` (which already
 * checks the global mute toggle and never throws) - this component never
 * reaches around that gate.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import type { SwitchFeel } from "@shared"
import { buttonVariants } from "@/components/ui/button"
import { playSwitchSound } from "@/lib/audio/switchSynth"
import { cn } from "@/lib/utils"

const ACTIVATION_KEYS = new Set(["Enter", " "])

export interface SwitchPressButtonProps {
  feel: SwitchFeel
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  className?: string
}

export function SwitchPressButton({ feel, pressed, onPressedChange, className }: SwitchPressButtonProps) {
  // Guards against a redundant press()/release() firing from two different
  // event sources (e.g. a keydown repeat slipping past `event.repeat` on some
  // browser, or pointerdown immediately followed by a synthetic pointerup) -
  // `onPressedChange(true)`/the sound should only fire on an actual
  // not-pressed -> pressed transition.
  const isPressedRef = useRef(false)

  function press() {
    if (isPressedRef.current) return
    isPressedRef.current = true
    onPressedChange(true)
    playSwitchSound(feel)
  }

  function release() {
    if (!isPressedRef.current) return
    isPressedRef.current = false
    onPressedChange(false)
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    press()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!ACTIVATION_KEYS.has(event.key)) return
    event.preventDefault() // stop Space from scrolling the page
    if (event.repeat) return
    press()
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (!ACTIVATION_KEYS.has(event.key)) return
    event.preventDefault()
    release()
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "select-none", className)}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onBlur={release}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {pressed ? "Pressed" : "Press switch"}
    </button>
  )
}
