import { lazy, Suspense } from "react"
import { Navigate, createBrowserRouter } from "react-router-dom"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { AdminRoute } from "@/lib/auth"
import { RootLayout } from "@/routes/RootLayout"
import { RouteFallback } from "@/routes/RouteFallback"

/**
 * Route-based code-splitting. Statically importing every route component
 * into one eager bundle grows the main chunk with every page added (e.g.
 * `@tanstack/react-table` landing in it through `AdminOrders.tsx`).
 *
 * Every leaf page component below is `React.lazy`, each wrapped in its own
 * `<Suspense fallback={<RouteFallback />}>` at the `element:` level - see
 * `RouteFallback.tsx`'s doc comment for why one shared, generic fallback is
 * the right granularity, not a bespoke skeleton per route.
 *
 * Route files all use named exports (`export function Home() {...}`,
 * etc.), not default exports, so each `lazy()` call maps the resolved
 * module to a `{ default }` shape inline
 * (`.then((m) => ({ default: m.Home }))`) rather than touching every route
 * file to add default exports just for this.
 *
 * `RootLayout`/`AdminLayout` (plus the `AdminRoute` guard) stay as regular,
 * eager imports on purpose: they're the persistent app chrome rendered on
 * every single route match (header/footer/demo banner/toast host, admin
 * subnav) - there's no "later" moment to defer them to, and they're tiny
 * next to the page bodies they wrap. Code-splitting them would only add a
 * network round-trip with no bundle-size win.
 *
 * `routes/BuildShare.tsx` statically imports `routes/Build.tsx` directly -
 * it reuses the full configurator wholesale for the `/b/:id` shared-build
 * view, not a parallel implementation. That's fine under this scheme:
 * `Build.tsx` is reachable two ways (this file's own lazy `import("./Build")`
 * for `/build`, and `BuildShare.tsx`'s static import for `/b/:id`), so
 * Rollup factors it into its own shared chunk referenced by both rather
 * than duplicating it.
 */
function lazyRoute(importer: Parameters<typeof lazy>[0]) {
  const LazyComponent = lazy(importer)
  return (
    <Suspense fallback={<RouteFallback />}>
      <LazyComponent />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: lazyRoute(() => import("@/routes/Home").then((m) => ({ default: m.Home }))),
      },
      {
        path: "shop",
        element: lazyRoute(() => import("@/routes/Shop").then((m) => ({ default: m.Shop }))),
      },
      {
        path: "shop/:slug",
        element: lazyRoute(() => import("@/routes/ShopProduct").then((m) => ({ default: m.ShopProduct }))),
      },
      {
        path: "switches/compare",
        element: lazyRoute(() => import("@/routes/SwitchCompare").then((m) => ({ default: m.SwitchCompare }))),
      },
      {
        path: "switches/:slug",
        element: lazyRoute(() => import("@/routes/SwitchDetail").then((m) => ({ default: m.SwitchDetail }))),
      },
      {
        path: "build",
        element: lazyRoute(() => import("@/routes/Build").then((m) => ({ default: m.Build }))),
      },
      {
        path: "b/:id",
        element: lazyRoute(() => import("@/routes/BuildShare").then((m) => ({ default: m.BuildShare }))),
      },
      {
        path: "drop/:slug",
        element: lazyRoute(() => import("@/routes/DropDetail").then((m) => ({ default: m.DropDetail }))),
      },
      {
        path: "cart",
        element: lazyRoute(() => import("@/routes/Cart").then((m) => ({ default: m.Cart }))),
      },
      {
        path: "checkout",
        element: lazyRoute(() => import("@/routes/Checkout").then((m) => ({ default: m.Checkout }))),
      },
      {
        path: "checkout/confirmation",
        element: lazyRoute(() =>
          import("@/routes/CheckoutConfirmation").then((m) => ({ default: m.CheckoutConfirmation })),
        ),
      },
      {
        path: "account",
        element: lazyRoute(() => import("@/routes/Account").then((m) => ({ default: m.Account }))),
      },
      {
        path: "account/orders/:id",
        element: lazyRoute(() => import("@/routes/OrderDetail").then((m) => ({ default: m.OrderDetail }))),
      },
      {
        path: "admin",
        element: (
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        ),
        children: [
          { index: true, element: <Navigate to="/admin/dashboard" replace /> },
          {
            path: "dashboard",
            element: lazyRoute(() => import("@/routes/AdminDashboard").then((m) => ({ default: m.AdminDashboard }))),
          },
          {
            path: "products",
            element: lazyRoute(() => import("@/routes/AdminProducts").then((m) => ({ default: m.AdminProducts }))),
          },
          {
            path: "products/:id",
            element: lazyRoute(() =>
              import("@/routes/AdminProductEdit").then((m) => ({ default: m.AdminProductEdit })),
            ),
          },
          {
            path: "orders",
            element: lazyRoute(() => import("@/routes/AdminOrders").then((m) => ({ default: m.AdminOrders }))),
          },
          {
            path: "group-buy",
            element: lazyRoute(() => import("@/routes/AdminGroupBuy").then((m) => ({ default: m.AdminGroupBuy }))),
          },
        ],
      },
      {
        path: "login",
        element: lazyRoute(() => import("@/routes/Login").then((m) => ({ default: m.Login }))),
      },
      {
        path: "register",
        element: lazyRoute(() => import("@/routes/Register").then((m) => ({ default: m.Register }))),
      },
      {
        path: "about",
        element: lazyRoute(() => import("@/routes/About").then((m) => ({ default: m.About }))),
      },
      {
        path: "*",
        element: lazyRoute(() => import("@/routes/NotFound").then((m) => ({ default: m.NotFound }))),
      },
    ],
  },
])
