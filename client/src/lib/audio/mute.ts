import { useSyncExternalStore } from "react"

/**
 * Global sound mute toggle (PROJECT_SPECS.md §6: "Sound never autoplays; a
 * global mute toggle persists"). Persistence mirrors `lib/theme.tsx`'s
 * established pattern exactly - a plain `localStorage` string key, read once
 * at module load, written back on every change. No new persistence
 * mechanism introduced.
 *
 * Deliberately NOT a React Context + Provider like `ThemeProvider`, even
 * though that's this codebase's sibling "global persisted preference":
 * flipping the theme has a DOM side effect (toggling a `<html>` class) that
 * must run before children decide how to render, which is exactly what a
 * Provider + `useEffect` is for. Muting has no DOM side effect at all - it's
 * read by `playSwitchSound()` at the exact moment a sound would play, nowhere
 * else. A module-level store + `useSyncExternalStore` keeps every subscriber
 * (header icon, sound-test field, anywhere else that plays sound later) in
 * sync without wrapping `<App>` in a second provider for one boolean.
 */
const MUTE_STORAGE_KEY = "clackforge:sound-muted"

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(MUTE_STORAGE_KEY) === "true"
}

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Default UNMUTED. Nothing in this app autoplays sound - every call site is
 * gated behind a real keystroke/tap (see `switchSynth.ts`'s doc comment) - so
 * there's no "surprise sound on load" risk a muted-by-default would guard
 * against. Muting is an opt-out for a feature the user has to deliberately
 * trigger in the first place.
 */
let muted = readStoredMuted()

/** Non-reactive read - safe to call from anywhere, including outside React (e.g. `playSwitchSound()`). */
export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  if (next === muted) return
  muted = next
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(next))
  }
  for (const listener of listeners) listener()
}

export function toggleMuted(): void {
  setMuted(!muted)
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive read for components (header mute icon, sound-test field's helper text). */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted)
}
