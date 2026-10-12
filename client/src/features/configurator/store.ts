import { create } from "zustand"
import type { BuildLayoutId, BuildSelections, BuildSlot } from "@shared"

/**
 * The live, in-progress configurator state: a single typed object in
 * Zustand that the 3D scene, price, spec sheet, and URL all derive from.
 * This is deliberately a subset of `BuildConfig` - `layout` + `selections`
 * only, not the full shared shape:
 *
 * - `productId`/base price are not stored here. They're a derived fact of
 *   `layout` (via `BASE_KIT_SLUG_BY_LAYOUT`) fetched live through TanStack
 *   Query (`useBuildPricing`), matching this app's own established split
 *   (catalog data via Query, in-progress UI/selection state via Zustand).
 *   Storing a `productId` here too would just be a second, staler copy of
 *   a value Query already owns.
 * - `accentKeys` (per-key customization) and `totalPrice` are out of
 *   scope here - totalPrice is always derived fresh via `calculatePrice`,
 *   never persisted as state that could drift from the selections that
 *   produced it. A full `BuildConfig` object (with `accentKeys: {}` and a
 *   real `totalPrice`) is assembled on demand from this store plus the
 *   live product fetch wherever one is actually needed (see
 *   `useBuildPricing.ts`), not stored twice.
 *
 * Business logic that needs catalog knowledge (e.g. "does changing the
 * layout invalidate an existing selection?") deliberately does not live
 * in this store - it lives in `routes/Build.tsx`, which also owns
 * composing the aria-live announcement text. This store stays a dumb,
 * synchronous setter.
 */
const DEFAULT_LAYOUT: BuildLayoutId = "tkl"

/**
 * Undo/redo. A bounded stack of `{layout, selections}` snapshots - the
 * exact same subset this store already treats as its one source of truth,
 * so undo/redo never has to know about anything else (price/3D/URL all
 * re-derive from these two fields elsewhere, same as every other consumer
 * of this store).
 *
 * Capped at `MAX_HISTORY` entries (bounded, not unbounded growth - a long
 * configurator session shouldn't leak memory) - oldest entries drop off
 * the front once the cap is hit. Keyboard wiring (Ctrl/Cmd+Z / Ctrl+Y /
 * Ctrl/Cmd+Shift+Z) lives in `routes/Build.tsx`, not here - this store
 * only exposes the API surface (`undo`/`redo`/`canUndo`/`canRedo`); the
 * visible buttons are `components/configurator/UndoRedoControls.tsx`,
 * calling this exact same API so both paths never drift apart.
 */
interface HistoryEntry {
  layout: BuildLayoutId
  selections: BuildSelections
}

const MAX_HISTORY = 50

function pushBounded(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
}

interface ConfiguratorState {
  layout: BuildLayoutId
  selections: BuildSelections
  /**
   * Atomic layout+selections update. Callers (`routes/Build.tsx`) precompute
   * which selections survive a layout change via `checkCompatibility` before
   * calling this - setting both fields in one `set()` call avoids a
   * transient render where `layout` has changed but a now-incompatible
   * selection briefly hasn't.
   */
  setLayout: (layout: BuildLayoutId, nextSelections: BuildSelections) => void
  selectOption: (slot: BuildSlot, optionId: string) => void
  clearSlot: (slot: BuildSlot) => void

  /** Past snapshots, oldest first - `past[past.length - 1]` is what `undo()` would restore. */
  past: HistoryEntry[]
  /** Snapshots undone past the current state, most-recently-undone last - what `redo()` would restore. */
  future: HistoryEntry[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  /**
   * Wholesale replace, used for URL hydration (`routes/Build.tsx` reading
   * a `?b=` param on mount). Deliberately does not push onto `past` and
   * clears both stacks: loading a shared link is a fresh starting point,
   * not an undoable "change" relative to whatever state happened to be in
   * memory before hydration ran (there usually isn't a meaningful
   * "before" at all, since this only runs once on mount).
   */
  hydrate: (next: HistoryEntry) => void
}

export const useConfiguratorStore = create<ConfiguratorState>((set) => ({
  layout: DEFAULT_LAYOUT,
  selections: {},
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  setLayout: (layout, nextSelections) =>
    set((state) => ({
      layout,
      selections: nextSelections,
      past: pushBounded(state.past, { layout: state.layout, selections: state.selections }),
      future: [],
      canUndo: true,
      canRedo: false,
    })),

  selectOption: (slot, optionId) =>
    set((state) => ({
      selections: { ...state.selections, [slot]: optionId },
      past: pushBounded(state.past, { layout: state.layout, selections: state.selections }),
      future: [],
      canUndo: true,
      canRedo: false,
    })),

  clearSlot: (slot) =>
    set((state) => {
      const selections = { ...state.selections }
      delete selections[slot]
      return {
        selections,
        past: pushBounded(state.past, { layout: state.layout, selections: state.selections }),
        future: [],
        canUndo: true,
        canRedo: false,
      }
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      const past = state.past.slice(0, -1)
      const future = pushBounded(state.future, { layout: state.layout, selections: state.selections })
      return {
        layout: previous.layout,
        selections: previous.selections,
        past,
        future,
        canUndo: past.length > 0,
        canRedo: true,
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state
      const next = state.future[state.future.length - 1]
      if (!next) return state
      const future = state.future.slice(0, -1)
      const past = pushBounded(state.past, { layout: state.layout, selections: state.selections })
      return {
        layout: next.layout,
        selections: next.selections,
        past,
        future,
        canUndo: true,
        canRedo: future.length > 0,
      }
    }),

  hydrate: (next) =>
    set({ layout: next.layout, selections: next.selections, past: [], future: [], canUndo: false, canRedo: false }),
}))
