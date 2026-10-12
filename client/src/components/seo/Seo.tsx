/**
 * Per-page title/meta. Uses React 19's native document-metadata support -
 * rendering `<title>`/`<meta>` directly from any component tree position,
 * React hoists them into the real `<head>` - rather than adding
 * `react-helmet-async` as a dependency this React version doesn't need
 * (its own README now recommends migrating away from itself for React 19
 * apps for exactly this reason).
 *
 * React does not de-dupe these tags across different component instances:
 * two live `<Seo>` call sites produce two real `<title>`/`<meta>` nodes in
 * the DOM at once. All that's guaranteed is which one wins first-match
 * reads (`document.title`, `document.querySelector`, Lighthouse, most
 * crawlers), and the resolution rule differs by case:
 *
 * 1. Cross-commit (e.g. an eager `RootLayout` plus a lazy+Suspense route
 *    under its `<Outlet>`): the earlier commit's tag wins. This is why
 *    `routes/RootLayout.tsx` deliberately does not render a default
 *    `<Seo>` - being the eager ancestor that commits first, it would
 *    permanently win over every route's own per-page override.
 *
 * 2. Same-commit (a parent synchronously rendering a plain, non-lazy child
 *    in one render pass, no Suspense boundary between them - e.g.
 *    `BuildShare.tsx` rendering `<Build/>` directly): the child's tag wins
 *    instead, regardless of JSX order. `routes/Build.tsx`'s
 *    `BuildProps.seoOverride` is the fix for that case - pass the override
 *    down so exactly one `<Seo>` ever renders for a given page.
 *
 * Moral: never render two simultaneously-mounted `<Seo>` instances for the
 * same visible page and assume ordering sorts it out. Either skip the
 * parent default (case 1) or thread an override prop so only one call site
 * is ever live (case 2).
 *
 * `client` is a plain Vite CSR SPA (createRoot, no SSR/hydration). Link-
 * unfurl bots that don't execute JavaScript (Slack, Discord, iMessage, and
 * others) only ever see `index.html`'s static `<head>`, which deliberately
 * carries no static description/OG/Twitter tags (only a static `<title>`,
 * kept for the pre-JS-paint flash). The per-route `og:title`/`og:image`
 * overrides below are correct for anything that does render JS (real
 * browsers, Googlebot, some modern social crawlers) but aren't a
 * substitute for SSR/prerendering if non-JS-bot link previews ever become
 * a real requirement - that would need server involvement.
 *
 * description/OG/Twitter tags are exclusively React-owned - one `<Seo>`
 * call per route, no static fallback in `index.html` for those tags -
 * because a plain `createRoot()` mount does not adopt or remove
 * pre-existing non-React `<head>` nodes; it inserts a second node and
 * leaves any static one in place. If a static `<meta>` node stays first in
 * document order, every first-match consumer reads the stale generic value
 * forever, and a per-page override is silently never seen. `<title>` is
 * the one tag that's safe to duplicate against a static HTML version,
 * since React inserts its managed title before the static one and
 * `document.title` is spec-defined as the first title in tree order - see
 * `index.html`'s own comment for that exception.
 */
export interface SeoProps {
  /** Rendered as `<title>{title} - CLACKFORGE</title>` unless `raw` is set. */
  title: string
  /** Skips the " - CLACKFORGE" suffix - only the Home page needs this (its title IS the brand name). */
  raw?: boolean
  description: string
  /** Defaults to the static site-wide `/og-image.png` (see `index.html`) when unset. */
  image?: string
  /** schema.org / OpenGraph type. Defaults to "website"; product pages pass "product". */
  type?: "website" | "product" | "article"
}

const SITE_NAME = "CLACKFORGE"
const DEFAULT_OG_IMAGE = "/og-image.png"

export function Seo({ title, raw = false, description, image, type = "website" }: SeoProps) {
  const fullTitle = raw ? title : `${title} | ${SITE_NAME}`
  const ogImage = image ?? DEFAULT_OG_IMAGE
  // Absolute URL for og:image/twitter:image per the OpenGraph/Twitter Card
  // spec (both expect a fully-qualified URL, not root-relative) - safe to
  // read `window.location` here, this component only ever renders client-side.
  const absoluteOgImage = ogImage.startsWith("http") ? ogImage : `${window.location.origin}${ogImage}`

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteOgImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteOgImage} />
    </>
  )
}
