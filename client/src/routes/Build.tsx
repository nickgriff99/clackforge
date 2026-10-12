import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  checkCompatibility,
  CURRENT_BUILD_CONFIG_VERSION,
  getOptionById,
  LAYOUT_LABELS,
  BuildSlotSchema,
  type BuildLayoutId,
  type BuildSelections,
  type BuildSlot,
} from "@shared"
import { Seo } from "@/components/seo/Seo"
import { Button } from "@/components/ui/button"
import { CameraPresetSwitcher } from "@/components/configurator/CameraPresetSwitcher"
import { LayoutStep } from "@/components/configurator/LayoutStep"
import { OptionStep } from "@/components/configurator/OptionStep"
import { ReviewSpecSheet } from "@/components/configurator/ReviewSpecSheet"
import { SwitchSoundTest } from "@/components/configurator/SwitchSoundTest"
import { UndoRedoControls } from "@/components/configurator/UndoRedoControls"
import { BuildCanvasHost } from "@/components/three/BuildCanvasHost"
import type { CameraPresetId } from "@/components/three/CameraRig"
import { getCaseMaterialProps } from "@/components/three/materialPresets"
import { useConfiguratorStore } from "@/features/configurator/store"
import { useBuildPricing } from "@/features/configurator/useBuildPricing"
import { useLiveAnnouncer } from "@/features/configurator/useLiveAnnouncer"
import { SLOT_META, STEP_ORDER } from "@/features/configurator/slotLabels"
import { BUILD_URL_PARAM, decodeBuildState, encodeBuildState } from "@/features/configurator/urlCodec"
import { KEYBOARD_LAYOUTS } from "@/lib/catalog/layouts"
import { formatCents } from "@/lib/utils"

type StepId = "layout" | BuildSlot | "review"
const MOBILE_STEPS: StepId[] = ["layout", ...STEP_ORDER, "review"]

function stepLabel(id: StepId): string {
  if (id === "layout") return "Layout"
  if (id === "review") return "Review"
  return SLOT_META[id].label
}

/** A DB-saved build's snapshot - matches this component's own `layout`/`selections` shape exactly. */
interface SavedBuildSnapshot {
  id: string
  layout: BuildLayoutId
  selections: BuildSelections
}

/** Field-by-field (not `JSON.stringify`) so key insertion order can never produce a false "diverged" read. */
function selectionsEqual(a: BuildSelections, b: BuildSelections): boolean {
  return BuildSlotSchema.options.every((slot) => a[slot] === b[slot])
}

interface BuildProps {
  /**
   * Overrides this route's own default `<Seo>` below - exists only for
   * `BuildShare.tsx` (`/b/:id`), which renders this component wholesale and
   * needs its own dynamic, per-build title to be what the page shows.
   *
   * Not wired via "render two `<Seo>` instances and let ordering sort it
   * out": when a parent and child both render React 19 native
   * `<title>`/`<meta>` tags in the same commit (no Suspense boundary between
   * them), the child's tag lands first in DOM order and wins every
   * first-match read, regardless of JSX order. That's the opposite of what
   * happens across separate commits (e.g. a lazy-loaded route under
   * `<Outlet>`), so same-commit and cross-commit ordering can't be assumed
   * to follow the same rule. This prop sidesteps it: exactly one `<Seo>`
   * ever renders for a given page, never two racing for the same tag.
   */
  seoOverride?: { title: string; description: string }
}

export function Build({ seoOverride }: BuildProps = {}) {
  const layout = useConfiguratorStore((s) => s.layout)
  const selections = useConfiguratorStore((s) => s.selections)
  const setLayoutAction = useConfiguratorStore((s) => s.setLayout)
  const selectOptionAction = useConfiguratorStore((s) => s.selectOption)
  const clearSlotAction = useConfiguratorStore((s) => s.clearSlot)

  const { priceResult, product, isPending: isProductPending, isError: isProductError } = useBuildPricing()
  const { message, announce } = useLiveAnnouncer()
  const [mobileStepIndex, setMobileStepIndex] = useState(0)
  const pendingAnnouncementRef = useRef<string | null>(null)

  // Tracks the most recent save this session; `canUseSavedLink` below only
  // trusts it while the live store still matches exactly what was saved -
  // any further edit silently falls the Share button back to the `?b=`
  // codec link rather than pointing at a now-stale DB row. Lives here (not
  // in `ReviewSpecSheet`) because the mobile single-step view
  // unmounts/remounts `ReviewSpecSheet` as the user navigates steps - this
  // state must survive that.
  const [savedBuild, setSavedBuild] = useState<SavedBuildSnapshot | null>(null)
  const canUseSavedLink = savedBuild !== null && savedBuild.layout === layout && selectionsEqual(savedBuild.selections, selections)

  // Local component state, not the Zustand configurator store: the active
  // camera angle is a view concern, not part of the shareable build
  // identity - the URL codec below only covers layout+selections+accentKeys.
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>("angled")

  // Dev-only test hook: lets a Playwright `page.evaluate(...)` trigger a
  // preset change directly (`window.__setCameraPreset("side")`) without
  // locating/clicking a specific card. `import.meta.env.DEV` is statically
  // replaced by Vite, so this effect dead-code-eliminates out of production
  // builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const withDebugHook = window as typeof window & { __setCameraPreset?: (preset: CameraPresetId) => void }
    withDebugHook.__setCameraPreset = setCameraPreset
    return () => {
      delete withDebugHook.__setCameraPreset
    }
  }, [])

  // Config serializes to a compact, versioned URL param; invalid/old URLs
  // fall back gracefully with a toast. See `urlCodec.ts` for the format.
  const [searchParams, setSearchParams] = useSearchParams()
  const [isUrlHydrated, setIsUrlHydrated] = useState(false)
  const hasAttemptedHydrationRef = useRef(false)

  // Hydrate once from `?b=`, if present, on mount. Guarded by a ref (not just
  // an empty dep array) so React StrictMode's dev-only double-invoke of
  // effects can't fire the toast/URL-strip side effects below twice.
  useEffect(() => {
    if (hasAttemptedHydrationRef.current) return
    hasAttemptedHydrationRef.current = true

    const raw = searchParams.get(BUILD_URL_PARAM)
    if (raw) {
      const result = decodeBuildState(raw)
      if (result.ok) {
        useConfiguratorStore.getState().hydrate({ layout: result.state.layout, selections: result.state.selections })
        // `result.state.accentKeys` is decoded but intentionally not applied
        // anywhere yet - the configurator store has no accentKeys field
        // since per-key customization UI doesn't exist. The codec already
        // round-trips it correctly for when that lands; nothing here needs
        // to change at that point besides a new `setAccentKeys(...)` call.
      } else {
        toast.error(result.message)
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete(BUILD_URL_PARAM)
            return next
          },
          { replace: true },
        )
      }
    }
    setIsUrlHydrated(true)
    // Mount-only - re-running on every `searchParams` identity change would
    // re-hydrate from whatever `?b=` this same effect/the sync effect below
    // just wrote, fighting itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep `?b=` in sync with the live store on every change, `replace: true`
  // so undo/redo and browser back/forward don't get spammed with one history
  // entry per option click. Waits for the hydration effect above to finish
  // first so this doesn't clobber a real `?b=` with the pre-hydration
  // default state on the very first render.
  useEffect(() => {
    if (!isUrlHydrated) return
    const encoded = encodeBuildState({ layout, selections, accentKeys: {} })
    if (searchParams.get(BUILD_URL_PARAM) === encoded) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(BUILD_URL_PARAM, encoded)
        return next
      },
      { replace: true },
    )
  }, [isUrlHydrated, layout, selections, searchParams, setSearchParams])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isModifier = event.ctrlKey || event.metaKey
      if (!isModifier) return

      // Defensive: don't hijack the browser's own undo/redo while focus is
      // inside a text field or contenteditable region. No text input exists
      // on `/build` today, but a future search/rename field shouldn't have
      // to remember to add this guard itself.
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return
      }

      const key = event.key.toLowerCase()
      const isRedoChord = (key === "z" && event.shiftKey) || key === "y"
      const isUndoChord = key === "z" && !event.shiftKey

      if (isUndoChord) {
        const store = useConfiguratorStore.getState()
        if (!store.canUndo) return
        event.preventDefault()
        store.undo()
        pendingAnnouncementRef.current = "Build undone."
      } else if (isRedoChord) {
        const store = useConfiguratorStore.getState()
        if (!store.canRedo) return
        event.preventDefault()
        store.redo()
        pendingAnnouncementRef.current = "Build redone."
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
    // `pendingAnnouncementRef` is a ref - stable identity, safe to read/write
    // from this mount-only listener without adding it as a dependency.
  }, [])

  // Fires once the price engine has settled after a change (synchronous for
  // option picks - the active layout's product is already loaded; async for
  // layout changes, which may need to fetch a different base kit first).
  // Waiting for `!isProductPending` avoids a transient "Total unavailable"
  // flash while that fetch is in flight.
  useEffect(() => {
    if (pendingAnnouncementRef.current === null) return
    if (isProductPending) return
    const reason = pendingAnnouncementRef.current
    pendingAnnouncementRef.current = null
    const totalText = priceResult?.ok ? formatCents(priceResult.subtotal) : "unavailable"
    announce(`${reason} Total ${totalText}.`)
  }, [priceResult, isProductPending, announce])

  const layoutKeys = KEYBOARD_LAYOUTS[layout].keys
  const layoutLabel = LAYOUT_LABELS[layout]
  const caseColorHex = selections.caseColor ? getOptionById(selections.caseColor)?.swatchHex : undefined
  const { roughness: caseRoughness, metalness: caseMetalness } = getCaseMaterialProps(
    selections.caseMaterial,
    selections.caseFinish,
  )

  function handleLayoutChange(nextLayout: BuildLayoutId) {
    if (nextLayout === layout) return
    const issues = checkCompatibility(selections, nextLayout)
    let nextSelections = selections
    let clearedNote = ""
    if (issues.length > 0) {
      nextSelections = { ...selections }
      const clearedSlots = new Set<BuildSlot>()
      for (const issue of issues) {
        for (const slot of issue.affectedSlots) clearedSlots.add(slot)
      }
      for (const slot of clearedSlots) delete nextSelections[slot]
      clearedNote = ` ${issues.map((issue) => issue.reason).join(" ")}`
    }
    setLayoutAction(nextLayout, nextSelections)
    pendingAnnouncementRef.current = `Layout changed to ${LAYOUT_LABELS[nextLayout]}.${clearedNote}`
  }

  function handleSelect(slot: BuildSlot, optionId: string) {
    const option = getOptionById(optionId)
    selectOptionAction(slot, optionId)
    pendingAnnouncementRef.current = `${SLOT_META[slot].label} changed to ${option?.label ?? optionId}.`
  }

  function handleClear(slot: BuildSlot) {
    clearSlotAction(slot)
    pendingAnnouncementRef.current = `${SLOT_META[slot].label} cleared.`
  }

  function renderOptionStep(slot: BuildSlot, idPrefix = "") {
    const meta = SLOT_META[slot]
    const optionStep = (
      <OptionStep
        slot={slot}
        title={meta.label}
        helpText={meta.helpText}
        optional={meta.optional}
        value={selections[slot]}
        selections={selections}
        layout={layout}
        onSelect={(optionId) => handleSelect(slot, optionId)}
        onClear={() => handleClear(slot)}
        idPrefix={idPrefix}
      />
    )

    // Sound test anchored right where the switch feel is actually chosen
    // rather than buried in Review. Reads the live selection directly so
    // it updates the instant a different switch is picked, with no extra
    // store wiring.
    if (slot !== "switches") return <div key={slot}>{optionStep}</div>

    const selectedSwitch = selections.switches ? getOptionById(selections.switches) : undefined
    return (
      <div key={slot} className="flex flex-col gap-4">
        {optionStep}
        <SwitchSoundTest
          selectedOptionId={selections.switches}
          selectedOptionLabel={selectedSwitch?.label}
          idPrefix={idPrefix}
        />
      </div>
    )
  }

  function renderReview() {
    if (!priceResult?.ok || !product) return null
    return (
      <ReviewSpecSheet
        lineItems={priceResult.lineItems}
        subtotal={priceResult.subtotal}
        version={CURRENT_BUILD_CONFIG_VERSION}
        productId={product.id}
        layout={layout}
        selections={selections}
        accentKeys={{}}
        savedBuildId={canUseSavedLink ? savedBuild!.id : null}
        onSaved={(id) => setSavedBuild({ id, layout, selections })}
      />
    )
  }

  function renderStepById(id: StepId) {
    // `idPrefix="mobile-"` - this panel and the desktop side panel below both
    // mount at once (see `LayoutStep`'s `idPrefix` doc comment); only one of
    // the two needs prefixing to make every id unique document-wide.
    if (id === "layout") return <LayoutStep value={layout} onChange={handleLayoutChange} idPrefix="mobile-" />
    if (id === "review") return renderReview()
    return renderOptionStep(id, "mobile-")
  }

  const runningTotalText = isProductPending ? "…" : priceResult?.ok ? formatCents(priceResult.subtotal) : "Unavailable"

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <Seo
        title={seoOverride?.title ?? "Build your clack"}
        description={
          seoOverride?.description ??
          "Configure a custom mechanical keyboard in real 3D. Pick a layout, case, switches, keycaps, and extras, with live pricing and fit checks as you go."
        }
      />
      {/* Text alternative for the decorative 3D canvas. */}
      <div aria-live="polite" role="status" className="sr-only">
        {message}
      </div>

      <header className="mb-6 flex flex-col gap-1 sm:mb-8">
        <h1 className="font-heading text-3xl">Build</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Pick a layout, then a case, plate, switches, keycaps, and extras. The 3D model updates as you go, and the
          running total is always visible, and every option is priced and checked for
          fit.
        </p>
      </header>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-4">
          <CameraPresetSwitcher value={cameraPreset} onChange={setCameraPreset} />

          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-card sm:aspect-[4/3] lg:aspect-video">
            <BuildCanvasHost
              layoutKeys={layoutKeys}
              layoutLabel={layoutLabel}
              caseColorHex={caseColorHex}
              caseRoughness={caseRoughness}
              caseMetalness={caseMetalness}
              cameraPreset={cameraPreset}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <UndoRedoControls
              onUndo={() => {
                pendingAnnouncementRef.current = "Build undone."
              }}
              onRedo={() => {
                pendingAnnouncementRef.current = "Build redone."
              }}
            />
            <span className="flex items-baseline gap-2">
              <span className="font-heading text-sm text-muted-foreground">Running total</span>
              <span className="font-specs text-xl">{runningTotalText}</span>
            </span>
          </div>

          {isProductError && (
            <p className="text-sm text-destructive">
              Couldn&apos;t load this layout&apos;s base kit. Pricing is unavailable right now.
            </p>
          )}
          {priceResult && !priceResult.ok && (
            <p className="text-sm text-destructive">{priceResult.error.message}</p>
          )}
        </div>

        {/* Mobile: one step at a time. */}
        <div className="flex flex-col gap-4 lg:hidden">
          <span className="font-mono text-xs text-muted-foreground">
            Step {mobileStepIndex + 1} of {MOBILE_STEPS.length}: {stepLabel(MOBILE_STEPS[mobileStepIndex] as StepId)}
          </span>
          {renderStepById(MOBILE_STEPS[mobileStepIndex] as StepId)}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={mobileStepIndex === 0}
              onClick={() => setMobileStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </Button>
            <Button
              type="button"
              disabled={mobileStepIndex === MOBILE_STEPS.length - 1}
              onClick={() => setMobileStepIndex((i) => Math.min(MOBILE_STEPS.length - 1, i + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        {/* Desktop: every step visible, scrollable, 3D model stays alongside. */}
        <div className="hidden lg:flex lg:max-h-[75vh] lg:flex-col lg:gap-4 lg:overflow-y-auto lg:pr-1">
          <LayoutStep value={layout} onChange={handleLayoutChange} />
          {STEP_ORDER.map((slot) => renderOptionStep(slot))}
          {renderReview()}
        </div>
      </div>
    </div>
  )
}
