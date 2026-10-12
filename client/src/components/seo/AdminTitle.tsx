/**
 * Lightweight, title-only tag for the `/admin/*` screens.
 *
 * Deliberately not `<Seo>`: these are authenticated-only internal tool
 * pages with zero public audience - `robots.txt` already disallows the
 * whole `/admin` path, so emitting `og:*`/`twitter:*`/`description` tags
 * would be pointless payload, and could read as misleadingly "shareable"
 * if a crawler ever did reach one. Browser-tab usability (so admin tabs
 * don't all read the site's static fallback title) is the one real need
 * here.
 */
export function AdminTitle({ title }: { title: string }) {
  // Single pre-concatenated string, not an expression child plus a literal
  // text child - React 19's native `<title>` hoisting renders an empty
  // `<head><title>` when given more than one child, instead of
  // concatenating them. Any future `<title>`/`<meta>` JSX in this app must
  // compute the full string first, then pass one child.
  return <title>{`${title} | Admin | CLACKFORGE`}</title>
}
