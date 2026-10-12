import { Redo2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfiguratorStore } from "@/features/configurator/store"

// Mac vs everyone-else shortcut glyphs. Evaluated once at module scope - this
// is an SPA (no SSR render of this route), and `navigator` is stable for the
// life of a tab, so there's no reason to recompute per render/mount.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.userAgent)
const UNDO_HINT = isMac ? "⌘Z" : "Ctrl+Z"
const REDO_HINT = isMac ? "⌘⇧Z" : "Ctrl+Shift+Z"

/**
 * Visible undo/redo toolbar. Wraps `useConfiguratorStore`'s
 * `undo`/`redo`/`canUndo`/`canRedo` API - no new history logic here, just
 * buttons. The keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) already
 * wired in `routes/Build.tsx` call these exact same store actions, so both
 * paths can never drift apart.
 *
 * Disabled state reuses this project's one established disabled idiom
 * (`Button`'s own `disabled:opacity-50 disabled:pointer-events-none`, same
 * as this file's sibling mobile Back/Next buttons in `Build.tsx`) - a real
 * dimmed, inert-pointer state, not a same-looking button that silently
 * no-ops.
 *
 * Shortcut hints are `hidden sm:inline-flex`: a physical ⌘Z/Ctrl+Z isn't
 * reachable on a touchscreen, so showing it there is just noise - icons-only
 * on mobile, still ≥24×24px via the shared `Button` `size="icon"` (`size-8`
 * = 32px).
 *
 * `onUndo`/`onRedo` fire after the store action, for the caller to
 * announce via its own `aria-live` region. A screen-reader user otherwise
 * gets zero feedback when undoing/redoing - `past.length`/`future.length`
 * alone can't safely distinguish "redo" from "a new pick that happens to
 * land on the same stack length," so the reason has to come from the call
 * site that knows which action just happened, not be guessed here or
 * inside the store. Optional + no-op default so this component still
 * works standalone without a parent wired for announcements.
 */
export function UndoRedoControls({
  onUndo,
  onRedo,
}: {
  onUndo?: () => void
  onRedo?: () => void
}) {
  const canUndo = useConfiguratorStore((s) => s.canUndo)
  const canRedo = useConfiguratorStore((s) => s.canRedo)
  const undo = useConfiguratorStore((s) => s.undo)
  const redo = useConfiguratorStore((s) => s.redo)

  function handleUndo() {
    undo()
    onUndo?.()
  }

  function handleRedo() {
    redo()
    onRedo?.()
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" disabled={!canUndo} aria-label="Undo last change" onClick={handleUndo}>
          <Undo2 />
        </Button>
        <span aria-hidden="true" className="hidden font-mono text-[10px] text-muted-foreground sm:inline-flex">
          {UNDO_HINT}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" disabled={!canRedo} aria-label="Redo last change" onClick={handleRedo}>
          <Redo2 />
        </Button>
        <span aria-hidden="true" className="hidden font-mono text-[10px] text-muted-foreground sm:inline-flex">
          {REDO_HINT}
        </span>
      </div>
    </div>
  )
}
