import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { formatCents } from "@/lib/utils"
import {
  checkCompatibility,
  getOptionsForSlot,
  type BuildLayoutId,
  type BuildSelections,
  type BuildSlot,
} from "@shared"

export interface OptionStepProps {
  slot: BuildSlot
  title: string
  helpText?: string
  optional?: boolean
  value: string | undefined
  /** The build's FULL current selections (not just this slot) - needed to evaluate compatibility per candidate option. */
  selections: BuildSelections
  layout: BuildLayoutId
  onSelect: (optionId: string) => void
  onClear: () => void
  /** See `LayoutStep.tsx`'s `idPrefix` doc comment - same duplicate-mount-id fix, same reason. */
  idPrefix?: string
}

/**
 * PROJECT_SPECS.md §8: "One generic `<OptionStep>` component renders any
 * configurator step from its options definition." Every slot (case material,
 * plate, switches, keycaps, ...) renders through this exact component -
 * adding a new option/slot to `shared/src/options.ts` needs zero changes
 * here.
 *
 * Accessibility (PROJECT_SPECS.md §6): real radio inputs (base-ui
 * `RadioGroup`/`Radio`, same primitive already used for product variants in
 * `routes/ShopProduct.tsx`), so arrow-key/Home/End navigation and screen
 * reader semantics come from the platform, not hand-rolled. Incompatible
 * options are deliberately NOT given the library's native `disabled` - a
 * natively-disabled radio input is excluded from the group's roving
 * tabindex/arrow-key stops entirely, which would make its reason
 * unreachable by keyboard. Instead: the option stays focusable/describable
 * (`aria-disabled` + `aria-describedby` pointing at an ALWAYS-rendered reason
 * line, not a hover-only tooltip - tooltips don't work on touch, and this
 * project is mobile-first), and the controlled `RadioGroup`'s
 * `onValueChange` simply refuses to apply an incompatible pick (the group
 * snaps back to the real current value). Never silently hidden, per spec.
 */
export function OptionStep({
  slot,
  title,
  helpText,
  optional,
  value,
  selections,
  layout,
  onSelect,
  onClear,
  idPrefix = "",
}: OptionStepProps) {
  const options = getOptionsForSlot(slot)

  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <legend className="font-heading text-base">
          {title}
          {optional && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
        </legend>
        {value !== undefined && (
          <Button type="button" variant="ghost" size="xs" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}

      <RadioGroup
        value={value ?? ""}
        onValueChange={(next) => {
          if (typeof next !== "string" || next === "") return
          const wouldViolate = checkCompatibility({ ...selections, [slot]: next }, layout)
          if (wouldViolate.length > 0) return
          onSelect(next)
        }}
        className="flex flex-col gap-2"
      >
        {options.map((option) => {
          const issues = option.id === value ? [] : checkCompatibility({ ...selections, [slot]: option.id }, layout)
          const incompatible = issues.length > 0
          const reasonId = `${idPrefix}${slot}-${option.id}-reason`

          return (
            <Label
              key={option.id}
              htmlFor={`${idPrefix}${slot}-${option.id}`}
              data-incompatible={incompatible || undefined}
              className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5 data-[incompatible]:opacity-60"
            >
              <RadioGroupItem
                id={`${idPrefix}${slot}-${option.id}`}
                value={option.id}
                aria-disabled={incompatible || undefined}
                aria-describedby={incompatible ? reasonId : undefined}
                className="mt-0.5"
              />
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-heading text-sm">
                    {option.swatchHex && (
                      <span
                        aria-hidden="true"
                        className="size-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: option.swatchHex }}
                      />
                    )}
                    {option.label}
                  </span>
                  <span className="font-specs text-xs text-muted-foreground">
                    {option.priceDeltaCents === 0 ? "Included" : `+${formatCents(option.priceDeltaCents)}`}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
                {incompatible && (
                  <span id={reasonId} className="text-xs text-destructive">
                    {issues.map((issue) => issue.reason).join(" ")}
                  </span>
                )}
              </span>
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
