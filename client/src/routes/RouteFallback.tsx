/**
 * Suspense fallback for every lazy-loaded route. One generic fallback,
 * reused at every route's `<Suspense>` boundary, rather than a bespoke
 * skeleton per route - each page already renders its own internal skeleton
 * once its chunk has loaded and its data is still in flight, shaped to
 * match that page's final layout. This fallback only covers the shorter,
 * earlier window while the route's JS chunk is still downloading, before
 * any page-specific code has run, so there's no stable "final layout" to
 * match yet. It also reuses the same loading markup as the auth guards in
 * `lib/auth.tsx` so a navigation that hits both an auth guard and a lazy
 * chunk boundary back-to-back shows one consistent loading affordance.
 *
 * `min-h-[100svh]` is a CLS fix, not cosmetic: a throttled Playwright sweep
 * measuring real layout-shift entries found that a shorter fallback (e.g.
 * `40vh`) let `<footer>` slide down as the dominant shift source once the
 * real page mounted at full height - CLS scores of 0.11-0.15 across the
 * routes tested. Reserving a full viewport keeps the footer off-screen in
 * both the before and after frame on the large majority of pages, which a
 * layout-shift observer doesn't count. `svh` (not `vh`) matches the
 * dynamic-viewport-height convention used elsewhere (`HeroSection.tsx`'s
 * pinned-scroll sections).
 */
export function RouteFallback() {
  return (
    <div
      className="flex min-h-[100svh] items-center justify-center text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="animate-pulse motion-reduce:animate-none">Loading…</span>
    </div>
  )
}
