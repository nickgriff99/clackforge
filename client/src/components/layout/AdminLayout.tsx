import { NavLink, Outlet } from "react-router-dom"

/**
 * Admin screens' own secondary nav, nested under the existing `RootLayout`
 * (via `routes/index.tsx`'s `/admin` route) so header/footer/demo
 * banner/toast host stay present - this is not a parallel app shell.
 */
const ADMIN_NAV = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Products", to: "/admin/products" },
  { label: "Orders", to: "/admin/orders" },
  { label: "Group Buy", to: "/admin/group-buy" },
]

export function AdminLayout() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl">Admin</h1>

      <nav aria-label="Admin sections" className="mb-8 flex gap-1 border-b border-border">
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast ease-standard ${
                isActive ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
