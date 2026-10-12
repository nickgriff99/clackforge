import { useState, type ChangeEvent } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMuted } from "@/lib/audio/mute"
import { DEFAULT_SWITCH_FEEL, getSwitchFeelForOptionId } from "@/lib/audio/switchFeel"
import { playSwitchSound } from "@/lib/audio/switchSynth"

export interface SwitchSoundTestProps {
  /** `selections.switches` from the configurator store - the currently chosen switch option id, if any. */
  selectedOptionId: string | undefined
  /** Display label for `selectedOptionId`, if resolved (`getOptionById(selectedOptionId)?.label`). Passed in rather than re-resolved here so this component stays a dumb, presentational piece. */
  selectedOptionLabel: string | undefined
  /**
   * This component's hardcoded `id="switch-sound-test"`/`"switch-sound-test-help"`
   * collide for real once `Build.tsx`'s mobile stepper lands on the
   * "switches" step, since the always-mounted desktop panel renders this
   * exact component too.
   */
  idPrefix?: string
}

const SOUND_TEST_MAX_LENGTH = 40

/**
 * Plays the chosen switch's sound sample (slight random pitch variation)
 * as the user types in a text field, rather than a grid of tappable virtual
 * keys - a single labeled `<input>` is one real, native,
 * keyboard-and-screen-reader control, and every `onChange` fire is already
 * a genuine user gesture, so there's no autoplay to worry about.
 *
 * With no switch selected, the field stays enabled and previews
 * `DEFAULT_SWITCH_FEEL` ("linear") rather than being disabled with a
 * reason - a disabled field here would be a dead end before the user has
 * even reached the Switches step. The helper text makes the default
 * explicit so nobody mistakes "previewing a default" for "broken".
 */
export function SwitchSoundTest({ selectedOptionId, selectedOptionLabel, idPrefix = "" }: SwitchSoundTestProps) {
  const [value, setValue] = useState("")
  const muted = useMuted()
  const feel = getSwitchFeelForOptionId(selectedOptionId)

  const previewNote = selectedOptionId
    ? `Previewing ${selectedOptionLabel ?? "your selected switch"}.`
    : `No switch selected yet. Previewing a ${DEFAULT_SWITCH_FEEL} feel.`

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.slice(0, SOUND_TEST_MAX_LENGTH)
    // Only play on growth (an actual keystroke adding a character) - a
    // deletion/select-all-clear isn't a "key press" the spec is modeling a
    // sound for, and pasting a long string shouldn't fire dozens of sounds
    // at once.
    if (next.length > value.length) {
      playSwitchSound(feel)
    }
    setValue(next)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <Label htmlFor={`${idPrefix}switch-sound-test`} className="font-heading text-sm">
        Sound test
      </Label>
      <p id={`${idPrefix}switch-sound-test-help`} className="text-xs text-muted-foreground">
        Type below to hear this switch. {previewNote}
        {muted ? " Sound is muted. Unmute from the header to hear it." : ""}
      </p>
      <Input
        id={`${idPrefix}switch-sound-test`}
        type="text"
        autoComplete="off"
        placeholder="Type here to test the sound…"
        value={value}
        onChange={handleChange}
        maxLength={SOUND_TEST_MAX_LENGTH}
        aria-describedby={`${idPrefix}switch-sound-test-help`}
      />
    </div>
  )
}
