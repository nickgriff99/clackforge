/**
 * Custom SVG force-curve chart - no charting library, same "build it
 * ourselves" spirit as `lib/audio/switchSynth.ts`'s procedural sound
 * instead of licensed samples.
 *
 * Plots each series' `SwitchSpec.forceCurve`, marking the actuation point
 * (always exactly `{ preTravelMm, actuationForceG }` per the schema's own
 * invariants documented in `switchSpec.ts` - no need to search the curve
 * array for it) with a circle, and the bottom-out point (always the
 * curve's last point, `{ totalTravelMm, bottomOutForceG }`) with a square,
 * so the two are distinguishable by shape, not just color - still
 * readable if two series happen to share a color or the chart is viewed
 * without color vision.
 *
 * Supports 1-3 overlaid series (the compare route's max) with a visible
 * legend. A real `<table>` per series is rendered below the chart, not
 * `sr-only`, so the same data is available as real text content for a
 * sighted user too, not just a screen reader.
 */
import type { SwitchSpec } from "@shared"

export interface ForceCurveSeries {
  spec: SwitchSpec
  /** Legend/table label for this series, e.g. a product name. */
  colorLabel: string
}

export interface ForceCurveChartProps {
  series: ForceCurveSeries[]
}

/**
 * Fixed 3-color palette, reused positionally (series[0] always gets the same
 * color across renders) - pulled from the app's existing CSS custom
 * properties (`index.css`) rather than inventing new hex literals, so the
 * chart automatically follows light/dark theme the same way the rest of the
 * UI does. Capped at 3 because the compare route caps at 3 switches.
 */
const SERIES_COLORS = ["var(--color-primary)", "var(--color-accent)", "var(--color-destructive)"] as const

const VIEWBOX_WIDTH = 480
const VIEWBOX_HEIGHT = 260
const PAD_LEFT = 40
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 32
const PLOT_WIDTH = VIEWBOX_WIDTH - PAD_LEFT - PAD_RIGHT
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PAD_TOP - PAD_BOTTOM

function describeEvent(travelMm: number, spec: SwitchSpec): string {
  if (travelMm === spec.preTravelMm) return "Actuation"
  if (travelMm === spec.totalTravelMm) return "Bottom-out"
  return "Mid-travel"
}

export function ForceCurveChart({ series }: ForceCurveChartProps) {
  if (series.length === 0) {
    return <p className="text-sm text-muted-foreground">No switches selected to chart yet.</p>
  }

  const maxTravel = Math.max(...series.map((s) => s.spec.totalTravelMm))
  const maxForce = Math.max(...series.map((s) => s.spec.bottomOutForceG)) * 1.08

  const scaleX = (travelMm: number) => PAD_LEFT + (travelMm / maxTravel) * PLOT_WIDTH
  const scaleY = (forceG: number) => PAD_TOP + PLOT_HEIGHT - (forceG / maxForce) * PLOT_HEIGHT

  const axisY = PAD_TOP + PLOT_HEIGHT

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        aria-label={`Force curve chart comparing ${series.map((s) => s.colorLabel).join(", ")}. The full data for each switch is also available in the table below the chart.`}
        className="w-full"
      >
        {/* axes */}
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={axisY} stroke="var(--color-border)" strokeWidth={1} />
        <line x1={PAD_LEFT} y1={axisY} x2={PAD_LEFT + PLOT_WIDTH} y2={axisY} stroke="var(--color-border)" strokeWidth={1} />
        <text x={PAD_LEFT} y={VIEWBOX_HEIGHT - 6} className="fill-muted-foreground" fontSize={10}>
          0mm
        </text>
        <text x={PAD_LEFT + PLOT_WIDTH} y={VIEWBOX_HEIGHT - 6} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          {maxTravel.toFixed(1)}mm travel
        </text>
        <text x={4} y={PAD_TOP + 8} className="fill-muted-foreground" fontSize={10}>
          {Math.round(maxForce)}g
        </text>
        <text x={4} y={axisY} className="fill-muted-foreground" fontSize={10}>
          0g
        </text>

        {series.map((s, index) => {
          const color = SERIES_COLORS[index % SERIES_COLORS.length]
          const points = s.spec.forceCurve.map((p) => `${scaleX(p.travelMm)},${scaleY(p.forceG)}`).join(" ")
          const actuationX = scaleX(s.spec.preTravelMm)
          const actuationY = scaleY(s.spec.actuationForceG)
          const bottomOutX = scaleX(s.spec.totalTravelMm)
          const bottomOutY = scaleY(s.spec.bottomOutForceG)
          return (
            <g key={s.spec.productSlug}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              <circle cx={actuationX} cy={actuationY} r={4} fill={color} stroke="var(--color-background)" strokeWidth={1} />
              <rect x={bottomOutX - 4} y={bottomOutY - 4} width={8} height={8} fill={color} stroke="var(--color-background)" strokeWidth={1} />
            </g>
          )
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s, index) => (
          <span key={s.spec.productSlug} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
            />
            {s.colorLabel} ({s.spec.feel})
          </span>
        ))}
        <span className="text-xs text-muted-foreground">● actuation &nbsp; ■ bottom-out</span>
      </div>

      {series.map((s) => (
        <table key={s.spec.productSlug} className="font-specs w-full border-collapse text-left text-xs">
          <caption className="mb-1 text-left font-heading text-sm text-foreground">
            {s.colorLabel} force curve
          </caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1 pr-4 font-normal">
                Travel (mm)
              </th>
              <th scope="col" className="py-1 pr-4 font-normal">
                Force (g)
              </th>
              <th scope="col" className="py-1 font-normal">
                Event
              </th>
            </tr>
          </thead>
          <tbody>
            {s.spec.forceCurve.map((p) => (
              <tr key={p.travelMm} className="border-b border-border/50">
                <td className="py-1 pr-4">{p.travelMm}</td>
                <td className="py-1 pr-4">{p.forceG}</td>
                <td className="py-1">{describeEvent(p.travelMm, s.spec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}
