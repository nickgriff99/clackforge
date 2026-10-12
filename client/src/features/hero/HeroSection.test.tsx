// @vitest-environment jsdom
/**
 * Component-level coverage for what `heroLayers.test.ts` and
 * `useHeroKeyboardInput.test.ts` don't reach in isolation: the real
 * `IntersectionObserver` wiring in `HeroSection.tsx` (does `inView` actually
 * gate keyboard input end-to-end, not just the hook's own `active` param in
 * isolation?), the LCP-critical headline rendering independent of the 3D
 * canvas, and the `prefers-reduced-motion` branch being a structurally
 * different (not just visually different) render path per spec §6.
 *
 * jsdom has no WebGL (`canvas.getContext("webgl")` returns `null`), so
 * `HeroCanvasHost` always resolves to the synchronous `state="poster"`
 * branch here and never triggers the `React.lazy(() => import("./HeroScene"))`
 * - this suite never touches three.js/R3F, by construction, not mocking.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HeroSection } from "./HeroSection"

type ObserverCallback = (entries: Pick<IntersectionObserverEntry, "isIntersecting">[]) => void

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: ObserverCallback
  constructor(callback: ObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting }])
  }
}

let reducedMotionMatches = false
let mobileViewportMatches = false

function stubMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotionMatches : mobileViewportMatches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach(() => {
  reducedMotionMatches = false
  mobileViewportMatches = false
  FakeIntersectionObserver.instances = []
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  stubMatchMedia()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderHero() {
  return render(
    <MemoryRouter>
      <HeroSection />
    </MemoryRouter>,
  )
}

describe("HeroSection", () => {
  it("renders the LCP-critical headline and CTAs independent of the 3D canvas (poster fallback under jsdom's no-WebGL)", () => {
    const { container, getByRole } = renderHero()
    expect(getByRole("heading", { level: 1 }).textContent).toBe("CLACKFORGE")
    // Rendered as a real `<a href>` (react-router `Link`) with `role="button"`
    // layered on top by the shared `Button` primitive (base-ui) - querying by
    // that actual rendered role, not the DOM tag, since that's the real a11y
    // name/role pairing a screen reader will announce.
    expect(getByRole("button", { name: "Start a build" })).toBeTruthy()
    expect(getByRole("button", { name: "Browse the shop" })).toBeTruthy()
    expect(container.querySelector('a[href="/build"]')).toBeTruthy()
    expect(container.querySelector('a[href="/shop"]')).toBeTruthy()
    expect(container.querySelector('[data-model-viewport-state="poster"]')).toBeTruthy()
  })

  it("shows the 'try typing' hint before any interaction and dismisses it (aria-hidden) after a matching keypress", () => {
    const { getByText } = renderHero()
    const hint = getByText("Try typing: your keystrokes press the keys.")
    expect(hint.getAttribute("aria-hidden")).toBe("false")

    fireEvent.keyDown(window, { code: "KeyQ" })

    expect(hint.getAttribute("aria-hidden")).toBe("true")
  })

  it("real IntersectionObserver wiring: a matching keypress while out of view does not register", () => {
    const { getByText } = renderHero()
    const hint = getByText("Try typing: your keystrokes press the keys.")
    expect(FakeIntersectionObserver.instances.length).toBe(1)

    act(() => FakeIntersectionObserver.instances[0]?.trigger(false))
    fireEvent.keyDown(window, { code: "KeyQ" })

    expect(hint.getAttribute("aria-hidden")).toBe("false")
  })

  it("real IntersectionObserver wiring: scrolling back into view re-enables the keypress", () => {
    const { getByText } = renderHero()
    const hint = getByText("Try typing: your keystrokes press the keys.")

    act(() => FakeIntersectionObserver.instances[0]?.trigger(false))
    fireEvent.keyDown(window, { code: "KeyQ" })
    expect(hint.getAttribute("aria-hidden")).toBe("false")

    act(() => FakeIntersectionObserver.instances[0]?.trigger(true))
    fireEvent.keyDown(window, { code: "KeyQ" })
    expect(hint.getAttribute("aria-hidden")).toBe("true")
  })

  it("shows the mobile tap hint instead of the typing hint below the sm breakpoint", () => {
    mobileViewportMatches = true
    const { getByText } = renderHero()
    expect(getByText("Tap a key to feel it click.")).toBeTruthy()
  })

  it("prefers-reduced-motion: renders every layer's callout as real static text at once, not just the active one", () => {
    reducedMotionMatches = true
    const { container } = renderHero()
    // Rendered as a `<dl>` of 5 entries (one `<dd>` per layer) rather than a
    // `<ul>`/`<li>` - assert on the real semantic element, not a specific
    // tag guess.
    expect(container.querySelectorAll("dl").length).toBe(1)
    expect(container.querySelectorAll("dd").length).toBe(5)
    const text = container.textContent ?? ""
    for (const label of ["Keycaps", "Switches", "Plate", "PCB", "Case"]) {
      expect(text).toContain(label)
    }
  })

  it("prefers-reduced-motion: still renders the headline, CTAs, and the canvas poster slot (not a degraded/broken branch)", () => {
    reducedMotionMatches = true
    const { container, getByRole } = renderHero()
    expect(getByRole("heading", { level: 1 }).textContent).toBe("CLACKFORGE")
    expect(getByRole("button", { name: "Start a build" })).toBeTruthy()
    expect(container.querySelector('[data-model-viewport-state="poster"]')).toBeTruthy()
  })

  it("motion-enabled branch does NOT render the static all-layers list (only reduced-motion does)", () => {
    const { container } = renderHero()
    expect(container.querySelectorAll("dl").length).toBe(0)
  })
})
