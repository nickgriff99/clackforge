# CLACKFORGE - brand + token doc

Portfolio demo store. No real brand name reused - "CLACKFORGE" is invented for
this project, not a real keyboard/switch/keycap company.

## Personality

Equal parts machine shop and demoscene. CLACKFORGE takes the mechanical-
keyboard hobby seriously - custom builds, group-buy drops, real spec
sheets - without being precious about it. Copy is direct and a little proud
of the noise these things make. Tagline: **"Build your clack."**

Tone in UI copy: confident, short sentences, no corporate hedging, the
occasional wink about the "clack" sound. Never apologetic about being a demo -
the demo-honesty banner says so plainly and the brand voice treats that as a
badge, not a caveat.

## Color

Dark is the default brand surface ("the workshop at night"); light is an
explicit opt-in ("daylight shop"). Both themes share the same two accents so
the brand reads consistently either way:

- **Forge amber** (`--primary`) - molten-metal orange, used for primary CTAs
  and the wordmark. Hot, not pastel.
- **Switch-LED cyan** (`--accent`) - a cool accent representing keycap/under-
  glow lighting, used for links, active nav state, and focus rings alongside
  amber.

All color tokens are defined as CSS custom properties in
`client/src/index.css` using OKLCH, with a `:root` (dark) block and a
`.light` override block. Tailwind v4 consumes them via `@theme inline`
(`--color-background: var(--background)`, etc.) so the same utility classes
(`bg-background`, `text-foreground`, `bg-primary`, ...) work in both themes -
no separate `dark:` variants needed for the base palette.

## Type

Three families, all self-hosted via Fontsource (no paid fonts, no runtime
Google Fonts request):

- **Display / headings** - Oswald (variable), condensed, stamped-metal-plate
  feel for H1–H4. Token: `font-heading` / `--font-display`.
- **Body** - Inter (variable), a clean grotesk for everything else. Token:
  `font-sans` (the default).
- **Specs & prices** - IBM Plex Mono, used for every price, SKU, and spec-sheet
  `key: value` pair so numbers always read as data, not prose. Token:
  `font-mono` / `.font-specs`.

## Spacing, radii, shadows, motion

- **Spacing**: Tailwind v4's default spacing scale (4px base unit) is used
  as-is - no project-specific override needed yet.
- **Radii**: `--radius: 0.5rem` base, with `--radius-sm/md/lg/xl/2xl` derived
  from it (sharper than the shadcn default 0.625rem - reads more machined,
  less soft-SaaS).
- **Shadows**: `--shadow-elevated` (cards/surfaces) and `--shadow-glow`
  (amber-tinted focus/hover glow on primary actions) - both theme-aware via
  `var()` indirection so light mode gets a softer, non-tinted shadow.
- **Motion**: `--ease-standard` / `--ease-emphasized` cubic-beziers,
  `--duration-fast` (120ms) / `--duration-base` (200ms) / `--duration-slow`
  (360ms) - registered as real Tailwind utilities (`ease-standard`,
  `duration-base`, ...), not just reference values.

## Where this lives in code

- Tokens: `client/src/index.css`
- Tailwind consumes tokens via Tailwind v4's CSS-first `@theme` config (no
  separate `tailwind.config.ts` file - v4 doesn't require one)
- shadcn/ui primitives restyled against these tokens: `client/src/components/ui/`
