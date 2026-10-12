import { ArrowDown, ArrowLeftRight, Box, ZoomIn, type LucideIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { CameraPresetId } from "@/components/three/CameraRig"

const PRESET_ORDER: CameraPresetId[] = ["angled", "top", "side", "close-up"]

const PRESET_META: Record<CameraPresetId, { label: string; icon: LucideIcon }> = {
  angled: { label: "Angled", icon: Box },
  top: { label: "Top", icon: ArrowDown },
  side: { label: "Side", icon: ArrowLeftRight },
  "close-up": { label: "Close-up", icon: ZoomIn },
}

export interface CameraPresetSwitcherProps {
  value: CameraPresetId
  onChange: (preset: CameraPresetId) => void
}

/**
 * Camera-angle switcher. Lives beside the 3D viewport, not inside the
 * scrollable option-step panel - camera angle is a view concern, not
 * build state (see `routes/Build.tsx`'s own comment on why `cameraPreset`
 * is local state, not part of `useConfiguratorStore`/the shareable URL).
 * Calls the same `setCameraPreset` that drives `BuildCanvasHost` ->
 * `CameraRig`'s damped fly-to - no new camera logic here.
 *
 * Visual language is deliberately the same bordered-card radio pattern
 * `OptionStep`/`LayoutStep` already established (`Label` wrapping a real
 * `RadioGroupItem`, `has-[[data-checked]]` -> primary border/tint/text) -
 * just laid out as a compact 4-across row instead of a vertical list, and
 * with a real text label, never icon-only.
 */
export function CameraPresetSwitcher({ value, onChange }: CameraPresetSwitcherProps) {
  return (
    <fieldset>
      <legend className="sr-only">Camera angle</legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next as CameraPresetId)
        }}
        className="grid grid-cols-4 gap-1.5"
      >
        {PRESET_ORDER.map((id) => {
          const { label, icon: Icon } = PRESET_META[id]
          return (
            <Label
              key={id}
              htmlFor={`camera-preset-${id}`}
              className="flex flex-col items-center gap-1 rounded-lg border border-border px-1.5 py-2 text-center text-muted-foreground transition-colors has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5 has-[[data-checked]]:text-primary motion-reduce:transition-none"
            >
              <span className="flex items-center gap-1">
                <RadioGroupItem id={`camera-preset-${id}`} value={id} className="size-3" />
                <Icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="font-heading text-[10px] leading-none">{label}</span>
            </Label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
