/**
 * `GET /api/builds/:id/og-image` card renderer - SVG, not PNG.
 *
 * A PNG OG-image route would need `node-canvas`, `@napi-rs/canvas`, or a
 * headless-browser screenshot - each either a native build (`node-gyp`) or
 * a heavyweight Chromium download, for a feature that's explicitly optional.
 * SVG is plain text, needs zero rendering library, and every modern
 * link-unfurling bot (Discord, Slack, iMessage, Twitter/X) and `<img>` tag
 * renders it natively.
 *
 * No webfonts are embedded: an SVG `@font-face` pointing at an external
 * font URL would make the response depend on a third-party fetch
 * succeeding at unfurl time, and most unfurl bots don't render
 * `@font-face` reliably anyway. Generic font stacks approximate the brand
 * faces (Oswald/Inter/IBM Plex Mono) closely enough for a thumbnail-sized
 * preview card.
 */

export interface OgImageSpecLine {
  label: string
  value: string
}

export interface OgImageInput {
  productName: string
  buildLabel: string
  layoutLabel: string
  priceDollars: string
  specLines: OgImageSpecLine[]
  caseSwatchHex: string
  cableSwatchHex: string
}

const WIDTH = 1200
const HEIGHT = 630

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

/** BRAND.md's dark-surface tokens, hand-copied (SVG has no CSS-var indirection). */
const COLORS = {
  surface: "#0b0d13",
  surfaceRaised: "#15181f",
  hairline: "#2a2d36",
  foreground: "#e7e9ec",
  muted: "#8a8f9c",
  amber: "#fa8927",
  cyan: "#26c0cf",
}

export function renderBuildOgImageSvg(input: OgImageInput): string {
  const specRows = input.specLines
    .slice(0, 5)
    .map((line, i) => {
      const y = 372 + i * 34
      return `
      <text x="80" y="${y}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="18" fill="${COLORS.muted}" letter-spacing="1">${escapeXml(line.label.toUpperCase())}</text>
      <text x="300" y="${y}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="18" fill="${COLORS.foreground}">${escapeXml(line.value)}</text>`
    })
    .join("")

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.surface}" />
  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" fill="none" stroke="${COLORS.hairline}" stroke-width="1" />

  <text x="80" y="100" font-family="Impact, 'Arial Narrow', sans-serif" font-size="28" letter-spacing="4" fill="${COLORS.amber}">CLACKFORGE</text>
  <text x="80" y="126" font-family="Georgia, serif" font-size="14" fill="${COLORS.muted}">Build your clack. &#183; Portfolio demo, no real products sold.</text>

  <text x="80" y="220" font-family="Impact, 'Arial Narrow', sans-serif" font-size="56" fill="${COLORS.foreground}">${escapeXml(input.buildLabel)}</text>
  <text x="80" y="264" font-family="Georgia, serif" font-size="22" fill="${COLORS.muted}">${escapeXml(input.productName)} &#183; ${escapeXml(input.layoutLabel)} layout</text>

  <rect x="80" y="300" width="44" height="44" rx="6" fill="${escapeXml(input.caseSwatchHex)}" stroke="${COLORS.hairline}" stroke-width="2" />
  <text x="136" y="318" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14" fill="${COLORS.muted}">CASE</text>
  <text x="136" y="338" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14" fill="${COLORS.foreground}">${escapeXml(input.caseSwatchHex)}</text>

  <rect x="220" y="300" width="44" height="44" rx="6" fill="${escapeXml(input.cableSwatchHex)}" stroke="${COLORS.hairline}" stroke-width="2" />
  <text x="276" y="318" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14" fill="${COLORS.muted}">CABLE</text>
  <text x="276" y="338" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14" fill="${COLORS.foreground}">${escapeXml(input.cableSwatchHex)}</text>

  <line x1="80" y1="356" x2="${WIDTH - 80}" y2="356" stroke="${COLORS.hairline}" stroke-width="1" />
  ${specRows}

  <rect x="${WIDTH - 340}" y="${HEIGHT - 140}" width="260" height="92" rx="8" fill="${COLORS.surfaceRaised}" stroke="${COLORS.hairline}" stroke-width="1" />
  <text x="${WIDTH - 316}" y="${HEIGHT - 94}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="14" fill="${COLORS.muted}" letter-spacing="1">TOTAL</text>
  <text x="${WIDTH - 316}" y="${HEIGHT - 62}" font-family="'IBM Plex Mono', 'Courier New', monospace" font-size="36" fill="${COLORS.amber}">$${escapeXml(input.priceDollars)}</text>
</svg>`
}
