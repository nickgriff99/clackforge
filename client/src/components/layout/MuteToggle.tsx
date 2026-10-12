import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toggleMuted, useMuted } from "@/lib/audio/mute"

/**
 * Global sound mute toggle. Lives in the header beside `ThemeToggle` (not
 * buried on `/build`): "global" means site-wide relevance for any future
 * sound use, not just the switch sound test. Persistence is
 * `lib/audio/mute.ts`'s `localStorage` store, mirroring the theme toggle's
 * established pattern.
 *
 * `aria-pressed` in addition to a state-describing `aria-label`: this is a
 * genuine two-state persistent toggle (unlike most of this header's buttons,
 * which open transient sheets), so exposing the ARIA toggle-button pattern
 * is the more correct semantic here, on top of (not instead of) the
 * "describe the action" label style `ThemeToggle` already uses.
 */
export function MuteToggle() {
  const muted = useMuted()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
      onClick={toggleMuted}
    >
      {muted ? <VolumeX /> : <Volume2 />}
    </Button>
  )
}
