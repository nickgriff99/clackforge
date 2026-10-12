/**
 * Home hero: explode-on-scroll 3D keyboard + physical/tap keyboard input.
 * Plain DOM orchestrator - owns scroll wiring (Framer Motion
 * `useScroll`/`useTransform`), the in-view gate, the device-sized layout
 * pick, and `useHeroKeyboardInput`'s pressed-key state; delegates the
 * actual `<Canvas>` tree to `HeroCanvasHost`/`HeroScene`
 * (`components/three/`), which this file never imports `three`/R3F/drei
 * through directly - only `HeroCanvasHost`'s plain-data props cross that
 * boundary, same lazy-chunk-isolation discipline as `routes/Build.tsx`.
 *
 * Scroll -> explode: `scrollYProgress` tracks this section's own scroll
 * progress (`useScroll({ target: sectionRef, offset: ["start start", "end
 * end"] })` - the standard Framer Motion "pinned section" recipe: the
 * section itself is tall (`h-[300vh]`, picked to give the explode/reassemble
 * tween enough scroll distance to read as deliberate, not a flick), its
 * child panel is `sticky top-14 h-[calc(100svh-3.5rem)]` (offset below
 * `Header`'s own sticky band - see the inline comment at the panel itself),
 * so the panel visually holds still while `scrollYProgress` sweeps 0 -> 1
 * across the section's full height.
 * `explodeFactor = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0])`
 * explodes across the first half of that scroll range and reassembles
 * across the second half, not a one-way animation. `explodeFactor` is
 * handed to `HeroCanvasHost` as a `MotionValue`, not a plain number, so
 * `ExplodeLayer`'s `useFrame` can poll it every frame with zero React
 * re-renders (see that file's doc comment).
 *
 * Reduced motion: a completely different render branch, not a tweaked
 * version of the scroll one - `useScroll`/`useTransform` are still called
 * (rules of hooks), but the section renders at normal single-viewport
 * height (no `h-[300vh]` scroll-pin spacer) and `explodeFactor` is a
 * constant `useMotionValue(1)` (fully exploded, so every layer and its
 * callout is visible). Choosing a normal-height section here, rather than
 * keeping the tall pinned layout with a frozen scene, is deliberate:
 * forcing a 300vh dead scroll zone on someone who's asked for less motion,
 * for an animation that no longer plays, would be its own usability tax.
 *
 * Callouts: reduced motion shows all 5 `HERO_LAYERS` as a static list at
 * once (nothing to "become active" without scroll-driven sequencing);
 * motion-enabled shows just the current `getActiveHeroLayerIndex` layer,
 * updated via `useMotionValueEvent` (fires on every `explodeFactor` change,
 * but `setActiveLayerIndex` is a no-op re-render unless the bucketed index
 * actually changed - React bails out on an identical `useState` value, so
 * this doesn't re-render 60x/sec even though the event fires that often).
 *
 * Keyboard input + in-view gate: `active` (IntersectionObserver on
 * `sectionRef`, same pattern as `BuildScene.tsx`) feeds both
 * `useHeroKeyboardInput` (stop listening for keystrokes once the hero is
 * scrolled away) and `HeroCanvasHost`'s `active` prop (pause the R3F
 * frameloop - see `HeroScene.tsx`'s doc comment).
 *
 * Mobile layout pick: `useIsMobileViewport()` swaps the 65% layout for the
 * smaller 60% one (fewer instanced keycaps/switches) below the `sm`
 * breakpoint - a simpler fixed rule rather than `BuildScene.tsx`'s full
 * `PerformanceMonitor` tiering, since this scene has no case-color
 * overrides or OrbitControls to protect, so that machinery would be new
 * plumbing for no corresponding need here.
 */
import { useScroll, useTransform, useMotionValue, useMotionValueEvent } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { HeroCanvasHost } from "@/components/three/HeroCanvasHost"
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/constants"
import { KEYBOARD_LAYOUTS } from "@/lib/catalog/layouts"
import { useIsMobileViewport } from "@/lib/useIsMobileViewport"
import { useReducedMotion } from "@/lib/useReducedMotion"
import { getActiveHeroLayerIndex, HERO_LAYER_IDS, HERO_LAYERS } from "./heroLayers"
import { useHeroKeyboardInput } from "./useHeroKeyboardInput"

const ARIA_LABEL =
  "Interactive 3D preview of a CLACKFORGE keyboard, exploded into its layers: keycaps, switches, plate, PCB, and case."

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const isMobile = useIsMobileViewport()
  const [inView, setInView] = useState(true)

  const layoutId = isMobile ? "60" : "65"
  const layoutKeys = KEYBOARD_LAYOUTS[layoutId].keys

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] })
  const scrollExplodeFactor = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0])
  const staticExplodeFactor = useMotionValue(1)
  const explodeFactor = reducedMotion ? staticExplodeFactor : scrollExplodeFactor

  const [activeLayerIndex, setActiveLayerIndex] = useState(0)
  useMotionValueEvent(scrollExplodeFactor, "change", (value) => {
    setActiveLayerIndex(getActiveHeroLayerIndex(value))
  })

  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) setInView(entry.isIntersecting)
      },
      { threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const { pressedKeyId, hasInteracted, pressKey, releaseKey } = useHeroKeyboardInput(layoutKeys, inView)

  const headline = (
    <div className="flex max-w-xl flex-col items-start gap-4 sm:gap-6">
      <h1 className="font-heading text-4xl leading-tight sm:text-6xl">{BRAND_NAME}</h1>
      <p className="text-base text-muted-foreground sm:text-lg">
        {BRAND_TAGLINE} Custom mechanical keyboards, built switch by switch, for people who care how their keyboard
        sounds as much as how it feels.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button size="lg" render={<Link to="/build" />}>
          Start a build
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/shop" />}>
          Browse the shop
        </Button>
      </div>
    </div>
  )

  const hintText = isMobile ? "Tap a key to feel it click." : "Try typing: your keystrokes press the keys."

  const hint = (
    <p
      aria-hidden={hasInteracted}
      className={cn(
        "flex items-center gap-1.5 font-specs text-xs text-muted-foreground transition-opacity duration-slow motion-reduce:transition-none",
        hasInteracted ? "opacity-0" : "opacity-100"
      )}
    >
      <span aria-hidden="true" className="text-accent">
        &gt;
      </span>
      {hintText}
    </p>
  )

  const canvasBlock = (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[4/3] lg:aspect-video">
        <HeroCanvasHost
          layoutKeys={layoutKeys}
          explodeFactor={explodeFactor}
          pressedKeyId={pressedKeyId}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
          active={inView}
          onPress={pressKey}
          onRelease={releaseKey}
          ariaLabel={ARIA_LABEL}
        />
      </div>
      {hint}
    </div>
  )

  if (reducedMotion) {
    return (
      <section ref={sectionRef} className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:py-24 lg:flex-row lg:items-center lg:justify-between">
          {headline}
          <div className="flex w-full max-w-xl flex-col gap-3 sm:gap-4">
            {canvasBlock}
            {/* Reduced motion: every layer's callout shown at once instead of one "active" layer gated by scroll. */}
            <dl className="flex flex-col divide-y divide-border rounded-xl border border-border font-specs text-sm">
              {HERO_LAYER_IDS.map((id, index) => {
                const layer = HERO_LAYERS[id]
                return (
                  <div key={id} className="flex items-baseline gap-3 px-4 py-2.5">
                    <dt aria-hidden="true" className="shrink-0 text-xs text-accent">
                      {String(index + 1).padStart(2, "0")}
                    </dt>
                    <dd className="flex flex-1 flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-foreground">{layer.label}</span>
                      <span className="text-muted-foreground">{layer.fact}</span>
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>
      </section>
    )
  }

  const activeLayer = HERO_LAYERS[HERO_LAYER_IDS[activeLayerIndex] ?? "keycaps"]

  return (
    <section ref={sectionRef} className="relative h-[300vh]">
      {/*
       * `top-14`/`h-[calc(100svh-3.5rem)]` account for `Header`'s own
       * `sticky top-0 h-14` band (`components/layout/Header.tsx`) - both are
       * sticky to the same scroll container, so without the offset the
       * header would permanently overlap the top of this panel for the
       * entire 300vh explode scroll instead of sitting flush below it.
       * `justify-start` (not `-center`) on mobile means if the stacked
       * headline+canvas content ever runs taller than the available height
       * on a short phone, the overflow clips at the bottom (canvas/callout)
       * rather than the top (headline/CTAs) - the CTAs stay reachable.
       */}
      <div className="sticky top-14 mx-auto flex h-[calc(100svh-3.5rem)] max-w-6xl flex-col justify-start gap-6 overflow-hidden px-4 py-6 sm:gap-8 sm:py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        {headline}
        <div className="flex w-full max-w-xl flex-col gap-3 sm:gap-4">
          {canvasBlock}
          {/* Scroll-driven: only the current layer's callout, real DOM text so everything the 3D canvas shows is also available as text. Remounts per `key` as the active layer changes, so `animate-in` replays each time. */}
          <div
            key={activeLayer.id}
            className="flex items-stretch gap-3 rounded-xl border border-border bg-card p-3 animate-in fade-in-0 duration-base sm:p-4"
          >
            <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-accent" />
            <div className="flex flex-col gap-0.5 font-specs text-sm">
              <p className="text-xs tracking-wide text-accent">
                {String(activeLayerIndex + 1).padStart(2, "0")} / {String(HERO_LAYER_IDS.length).padStart(2, "0")}
                {" \u00b7 "}
                {activeLayer.label.toUpperCase()}
              </p>
              <p className="text-muted-foreground">{activeLayer.fact}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
