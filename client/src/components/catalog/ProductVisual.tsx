import { useId } from "react"
import type { ProductType } from "@shared"
import { KEYBOARD_LAYOUTS, type KeyboardLayoutId } from "@/lib/catalog/layouts"

/**
 * Procedural product art drawn from the same data the 3D configurator uses.
 * Kits draw their real key layout, switches draw an exploded cross-section
 * colored by feel, keycap sets draw a keycap grid, and accessories draw a
 * simple silhouette. Zero image weight, no network request, themed by the
 * same palette as the 3D scenes.
 */

const WIDTH = 400
const HEIGHT = 300

interface Palette {
  body: string
  bodyEdge: string
  key: string
  keyTop: string
  accent: string
  legend: string
}

const PALETTES: Palette[] = [
  { body: "#3b424e", bodyEdge: "#5a6270", key: "#4c5462", keyTop: "#6a7384", accent: "#fa8927", legend: "#f0f2f4" },
  { body: "#2f3a4a", bodyEdge: "#52647c", key: "#40506a", keyTop: "#5d7194", accent: "#26c0cf", legend: "#f0f2f4" },
  { body: "#1f2a44", bodyEdge: "#3d4f7a", key: "#2d3d66", keyTop: "#47598a", accent: "#fa8927", legend: "#f0f2f4" },
  { body: "#4a463f", bodyEdge: "#736d62", key: "#6a655a", keyTop: "#8d877a", accent: "#26c0cf", legend: "#1b1d22" },
  { body: "#41304a", bodyEdge: "#6a4f7a", key: "#58406a", keyTop: "#78598f", accent: "#fa8927", legend: "#f0f2f4" },
]

const AURORA_STOPS = ["#26c0cf", "#7c6bff", "#3ddc97"]

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function paletteFor(slug: string): Palette {
  return PALETTES[hash(slug) % PALETTES.length] as Palette
}

function layoutIdFromSpec(layout: string | undefined): KeyboardLayoutId {
  const value = (layout ?? "").toLowerCase()
  if (value.startsWith("60")) return "60"
  if (value.startsWith("65")) return "65"
  if (value.startsWith("75")) return "75"
  return "tkl"
}

const ACCENT_KEY_IDS = new Set(["Escape", "Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])

function KitArt({ slug, specs }: { slug: string; specs: Record<string, string> }) {
  const palette = paletteFor(slug)
  const keys = KEYBOARD_LAYOUTS[layoutIdFromSpec(specs.Layout)].keys
  const maxX = Math.max(...keys.map((k) => k.x + k.width))
  const maxY = Math.max(...keys.map((k) => k.y + k.height))
  const scale = Math.min((WIDTH - 90) / maxX, (HEIGHT - 110) / maxY)
  const boardW = maxX * scale
  const boardH = maxY * scale
  const left = (WIDTH - boardW) / 2
  const top = (HEIGHT - boardH) / 2 - 6
  const pad = 14

  return (
    <g>
      <ellipse cx={WIDTH / 2} cy={top + boardH + pad + 18} rx={boardW / 2 + 10} ry={9} fill="#000" opacity={0.35} />
      <rect
        x={left - pad}
        y={top - pad}
        width={boardW + pad * 2}
        height={boardH + pad * 2}
        rx={14}
        fill={palette.body}
        stroke={palette.bodyEdge}
        strokeWidth={1.5}
      />
      {keys.map((k) => {
        const accent = ACCENT_KEY_IDS.has(k.id)
        const x = left + k.x * scale + 1.2
        const y = top + k.y * scale + 1.2
        const w = k.width * scale - 2.4
        const h = k.height * scale - 2.4
        return (
          <g key={k.id}>
            <rect x={x} y={y} width={w} height={h} rx={3} fill={accent ? palette.accent : palette.key} />
            <rect
              x={x + 1.6}
              y={y + 1.2}
              width={Math.max(w - 3.2, 1)}
              height={Math.max(h - 4.4, 1)}
              rx={2.5}
              fill={accent ? "#ffb066" : palette.keyTop}
              opacity={accent ? 0.85 : 0.9}
            />
          </g>
        )
      })}
    </g>
  )
}

const FEEL_COLORS: Record<string, string> = {
  linear: "#fa8927",
  tactile: "#26c0cf",
  clicky: "#8e7bff",
}

function SwitchArt({ slug, specs }: { slug: string; specs: Record<string, string> }) {
  const palette = paletteFor(slug)
  const stem = FEEL_COLORS[(specs.Feel ?? "").toLowerCase()] ?? palette.accent
  const cx = WIDTH / 2
  const spring = Array.from({ length: 7 }, (_, i) => `${cx + (i % 2 === 0 ? -16 : 16)} ${178 + i * 7}`).join(" L ")

  return (
    <g>
      <ellipse cx={cx} cy={262} rx={92} ry={9} fill="#000" opacity={0.35} />
      <rect x={cx - 66} y={52} width={132} height={52} rx={10} fill={palette.keyTop} stroke={palette.bodyEdge} strokeWidth={1.5} />
      <rect x={cx - 66} y={52} width={132} height={14} rx={7} fill="#fff" opacity={0.12} />
      <rect x={cx - 11} y={104} width={22} height={64} rx={4} fill={stem} />
      <rect x={cx - 24} y={96} width={48} height={14} rx={5} fill={stem} />
      <path d={`M ${cx} 170 L ${spring}`} fill="none" stroke="#aab1bb" strokeWidth={3} strokeLinejoin="round" />
      <rect x={cx - 66} y={226} width={132} height={32} rx={10} fill={palette.body} stroke={palette.bodyEdge} strokeWidth={1.5} />
      <circle cx={cx - 40} cy={242} r={4} fill="#aab1bb" />
      <circle cx={cx + 40} cy={242} r={4} fill="#aab1bb" />
    </g>
  )
}

const KEYCAP_LEGENDS = "QWERTYASDFGHJKZXCVBNM"

function KeycapArt({ slug, specs, gradientId }: { slug: string; specs: Record<string, string>; gradientId: string }) {
  const palette = paletteFor(slug)
  const aurora = slug.includes("aurora")
  const spherical = (specs.Profile ?? "").toLowerCase() === "spherical"
  const cols = 7
  const rows = 3
  const cell = 46
  const gap = 5
  const gridW = cols * cell + (cols - 1) * gap
  const gridH = rows * cell + (rows - 1) * gap
  const left = (WIDTH - gridW) / 2
  const top = (HEIGHT - gridH) / 2

  return (
    <g>
      {aurora && (
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={left} y1={top} x2={left + gridW} y2={top + gridH}>
            {AURORA_STOPS.map((color, i) => (
              <stop key={color} offset={i / (AURORA_STOPS.length - 1)} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
      )}
      <ellipse cx={WIDTH / 2} cy={top + gridH + 20} rx={gridW / 2} ry={9} fill="#000" opacity={0.3} />
      {Array.from({ length: rows * cols }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = left + col * (cell + gap)
        const y = top + row * (cell + gap)
        const accent = (i + hash(slug)) % 6 === 0
        const base = aurora ? `url(#${gradientId})` : accent ? palette.accent : palette.key
        const topFill = aurora ? `url(#${gradientId})` : accent ? "#ffb066" : palette.keyTop
        const legend = KEYCAP_LEGENDS[(i + hash(slug)) % KEYCAP_LEGENDS.length]
        return (
          <g key={i}>
            <rect x={x} y={y} width={cell} height={cell} rx={7} fill={base} />
            <rect
              x={x + 5}
              y={y + 4}
              width={cell - 10}
              height={cell - 13}
              rx={spherical ? 14 : 5}
              fill={topFill}
              opacity={aurora ? 0.8 : 0.95}
            />
            <text
              x={x + cell / 2}
              y={y + cell / 2 + 3}
              textAnchor="middle"
              fontSize={14}
              fontFamily="IBM Plex Mono, monospace"
              fontWeight={600}
              fill={aurora ? "#0b0d13" : accent ? "#1b1d22" : palette.legend}
            >
              {legend}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function AccessoryArt({ slug }: { slug: string }) {
  const palette = paletteFor(slug)
  const stroke = { fill: "none", stroke: palette.accent, strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  if (slug.includes("puller")) {
    const pro = slug.includes("pro")
    return (
      <g>
        <ellipse cx={200} cy={250} rx={70} ry={8} fill="#000" opacity={0.35} />
        <path d="M 168 232 L 168 120 Q 168 66 200 66 Q 232 66 232 120 L 232 232" {...stroke} />
        <path d="M 168 232 Q 200 214 232 232" {...stroke} strokeWidth={5} />
        {pro && <rect x={176} y={206} width={48} height={34} rx={8} fill={palette.key} stroke={palette.bodyEdge} strokeWidth={1.5} />}
      </g>
    )
  }
  if (slug.includes("case")) {
    return (
      <g>
        <ellipse cx={200} cy={236} rx={120} ry={9} fill="#000" opacity={0.35} />
        <path d="M 160 88 Q 160 58 200 58 Q 240 58 240 88" {...stroke} strokeWidth={6} stroke={palette.bodyEdge} />
        <rect x={86} y={86} width={228} height={140} rx={18} fill={palette.body} stroke={palette.bodyEdge} strokeWidth={2} />
        <path d="M 86 140 L 314 140" stroke={palette.bodyEdge} strokeWidth={3} strokeDasharray="8 6" />
        <rect x={186} y={128} width={28} height={22} rx={5} fill={palette.accent} />
      </g>
    )
  }
  if (slug.includes("riser")) {
    return (
      <g>
        <ellipse cx={200} cy={236} rx={130} ry={9} fill="#000" opacity={0.35} />
        <polygon points="80,226 320,226 320,170 80,198" fill={palette.body} stroke={palette.bodyEdge} strokeWidth={2} strokeLinejoin="round" />
        <polygon points="80,198 320,170 320,150 80,176" fill={palette.keyTop} stroke={palette.bodyEdge} strokeWidth={2} strokeLinejoin="round" />
        <rect x={96} y={214} width={30} height={10} rx={4} fill={palette.accent} />
        <rect x={274} y={214} width={30} height={10} rx={4} fill={palette.accent} />
      </g>
    )
  }
  if (slug.includes("stabilizer")) {
    return (
      <g>
        <ellipse cx={200} cy={236} rx={120} ry={9} fill="#000" opacity={0.35} />
        <rect x={90} y={120} width={220} height={14} rx={7} fill={palette.keyTop} stroke={palette.bodyEdge} strokeWidth={1.5} />
        <rect x={90} y={150} width={220} height={14} rx={7} fill={palette.key} stroke={palette.bodyEdge} strokeWidth={1.5} />
        {[110, 290].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy={178} r={18} fill={palette.body} stroke={palette.bodyEdge} strokeWidth={2} />
            <path d={`M ${cx - 9} 178 L ${cx + 9} 178 M ${cx} 169 L ${cx} 187`} stroke={palette.accent} strokeWidth={3} strokeLinecap="round" />
          </g>
        ))}
      </g>
    )
  }
  const coils = Array.from({ length: 6 }, (_, i) => `${110 + i * 36} ${i % 2 === 0 ? 112 : 188}`).join(" L ")
  return (
    <g>
      <ellipse cx={200} cy={236} rx={120} ry={9} fill="#000" opacity={0.3} />
      <path d={`M 70 150 L ${coils} L 330 150`} {...stroke} strokeWidth={6} />
      <rect x={52} y={134} width={26} height={32} rx={6} fill={palette.key} stroke={palette.bodyEdge} strokeWidth={1.5} />
      <rect x={322} y={134} width={26} height={32} rx={6} fill={palette.key} stroke={palette.bodyEdge} strokeWidth={1.5} />
    </g>
  )
}

export interface ProductVisualProps {
  slug: string
  category: ProductType
  specs: Record<string, string>
  /** Accessible description of the art. Pass the product name. */
  label: string
  className?: string
}

export function ProductVisual({ slug, category, specs, label, className }: ProductVisualProps) {
  const reactId = useId()
  const uid = reactId.replace(/:/g, "")
  const glow = paletteFor(slug).accent

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" stopColor={glow} stopOpacity={0.22} />
          <stop offset="100%" stopColor={glow} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} style={{ fill: "var(--card)" }} />
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${uid}-glow)`} />
      {category === "KIT" && <KitArt slug={slug} specs={specs} />}
      {category === "SWITCH" && <SwitchArt slug={slug} specs={specs} />}
      {category === "KEYCAP_SET" && <KeycapArt slug={slug} specs={specs} gradientId={`${uid}-aurora`} />}
      {category !== "KIT" && category !== "SWITCH" && category !== "KEYCAP_SET" && <AccessoryArt slug={slug} />}
    </svg>
  )
}
