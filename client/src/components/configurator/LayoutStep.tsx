import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { LAYOUT_LABELS, type BuildLayoutId } from "@shared"

const LAYOUT_IDS = Object.keys(LAYOUT_LABELS) as BuildLayoutId[]

const LAYOUT_DESCRIPTIONS: Record<BuildLayoutId, string> = {
  "60": "Compact, with no function row and no arrows. Every key does double duty.",
  "65": "Arrows and a tight nav column, still no function row.",
  "75": "Full function row in a dense, gap-less package.",
  tkl: "Full function row and a proper nav block, generously spaced.",
}

export interface LayoutStepProps {
  value: BuildLayoutId
  onChange: (layout: BuildLayoutId) => void
  /**
   * Prefixes every generated `id`/`htmlFor` pair (default none). `Build.tsx`
   * mounts both the mobile single-step panel and the desktop side panel at
   * once (CSS `hidden`/`lg:flex` toggles visibility; it doesn't unmount
   * either) - without a distinct prefix per panel, whichever step is
   * active on mobile collides with the desktop panel's identical
   * `id="layout-60"` etc., and base-ui's label-association fallback
   * silently loses the association for one of the two duplicates, leaving
   * that copy's `role="radio"` with no accessible name at all (axe's
   * `aria-toggle-field-name` violation).
   */
  idPrefix?: string
}

/**
 * Required, always has a value - the 3D model has no meaningful "unset"
 * layout. Not built on top of the generic `OptionStep`: layout isn't one of
 * the catalog options, it's `BuildConfig.layout` itself, a different shape
 * with no `priceDeltaCents`/compatibility rules of its own.
 */
export function LayoutStep({ value, onChange, idPrefix = "" }: LayoutStepProps) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <legend className="font-heading text-base">Layout</legend>
      <p className="text-xs text-muted-foreground">
        Sets the key count and the base kit this build starts from. Changing it later may clear a choice that no
        longer fits.
      </p>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next as BuildLayoutId)
        }}
        className="grid grid-cols-2 gap-2"
      >
        {LAYOUT_IDS.map((id) => (
          <Label
            key={id}
            htmlFor={`${idPrefix}layout-${id}`}
            className="flex flex-col gap-1 rounded-lg border border-border p-3 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
          >
            <span className="flex items-center gap-2">
              <RadioGroupItem id={`${idPrefix}layout-${id}`} value={id} />
              <span className="font-heading text-sm">{LAYOUT_LABELS[id]}</span>
            </span>
            <span className="text-xs text-muted-foreground">{LAYOUT_DESCRIPTIONS[id]}</span>
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
