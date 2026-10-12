import { cn } from "cn"

/**
 * A stylized top-down keyboard silhouette, built from flex boxes (not a
 * raster image) so it themes automatically via `bg-card`/`border-border`/
 * `bg-primary`/`bg-accent` tokens in both light and dark mode - see
 * `BRAND.md`. This is the designed static poster image shown before the
 * 3D canvas mounts, and the permanent visual when 3D never loads (no
 * WebGL, sustained low perf, etc. - that's the caller's fallback
 * decision; this component is just the art).
 *
 * Each row is an ANSI-60%-ish unit layout (1u standard key, 2.25u enter,
 * 6.25u spacebar, ...). Key width is expressed as a Tailwind `grow-[n]`
 * utility pulled from a literal lookup map (not interpolated into the
 * class string) so Tailwind's static class scanner can still find and
 * generate every class at build time.
 */

const GROW: Record<number, string> = {
  1: "grow-[1]",
  1.25: "grow-[1.25]",
  1.5: "grow-[1.5]",
  1.75: "grow-[1.75]",
  2: "grow-[2]",
  2.25: "grow-[2.25]",
  2.75: "grow-[2.75]",
  6.25: "grow-[6.25]",
}

// Row definitions in keycap units (u). Approximate ANSI 60%, not literal -
// this is a brand illustration, not a layout engine (that's `layouts.ts`'s job).
const ROWS: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], // esc · 1-0 · - · = · backspace
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], // tab · qwertyuiop[] · \
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], // caps · asdfghjkl;' · enter
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], // shift · zxcvbnm,./ · shift
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25], // ctrl win alt · space · alt fn ctrl
]

// Highlighted keys (per-key customization callout) - used sparingly per
// BRAND.md ("ONE saturated accent ... used sparingly"): just Esc + Enter.
const ACCENT_KEYS = new Set(["0-0", "2-12"])

export function KeyboardPoster({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Stylized illustration of a configured mechanical keyboard"
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-background to-card",
        className
      )}
    >
      <div aria-hidden="true" className="relative flex h-[72%] w-[88%] max-w-[560px] items-center justify-center">
        {/* switch-LED underglow */}
        <div className="absolute inset-x-[8%] bottom-[-8%] h-[20%] rounded-full bg-accent/25 blur-xl" />

        {/* case */}
        <div className="relative flex h-full w-full flex-col justify-between gap-[3%] rounded-2xl border border-border bg-secondary p-[3%] shadow-elevated">
          {ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="flex flex-1 gap-[1.2%]">
              {row.map((w, keyIndex) => {
                const isAccent = ACCENT_KEYS.has(`${rowIndex}-${keyIndex}`)
                return (
                  <div
                    key={keyIndex}
                    className={cn(
                      "h-full shrink-0 basis-0 rounded-[18%] border",
                      GROW[w],
                      isAccent ? "border-primary bg-primary/85" : "border-border/70 bg-card"
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
