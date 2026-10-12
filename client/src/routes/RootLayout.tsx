import { Outlet } from "react-router-dom"
import { DemoBanner } from "@/components/layout/DemoBanner"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import { Toaster } from "@/components/ui/sonner"
import { useCartMergeOnSignIn } from "@/features/cart/useCartMerge"

/**
 * Present on every route - demo banner, header, footer, toast host.
 *
 * Deliberately does not render a default `<Seo>` here: `<Seo>` instances
 * don't merge across different simultaneously-mounted component positions
 * the way `<title>`'s own browser-native singleton semantics do - React
 * hoists each rendered `<meta>` as its own DOM node and only updates/removes
 * it in place when that same component instance re-renders or unmounts.
 * Two distinct `<Seo>` call sites alive at once (this layout plus whatever
 * route is nested under its permanent `<Outlet>`) would just produce two
 * `<meta name="description">` nodes, with the one rendered first (this
 * layout's, since it's the parent) winning every first-match read and
 * silently defeating the per-page override. Routes that need SEO own their
 * single `<Seo>` call directly - see `Seo.tsx`'s doc comment.
 */
export function RootLayout() {
  // Mounted once at the root so it observes every sign-in path (login,
  // register, Google OAuth redirect) regardless of which page triggered it -
  // see useCartMergeOnSignIn's doc comment.
  useCartMergeOnSignIn()

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </div>
  )
}
