import { Link } from "react-router-dom"
import { BRAND_NAME, BRAND_TAGLINE, DEMO_BANNER_MESSAGE, FOOTER_NAV } from "@/lib/constants"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <span className="font-heading text-lg tracking-wide">{BRAND_NAME}</span>
          <p className="max-w-sm text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A fictional store with a real stack: a 3D configurator, group-buy drops, and a working admin.
          </p>
        </div>

        {FOOTER_NAV.map((column) => (
          <div key={column.heading} className="flex flex-col gap-2">
            <span className="font-heading text-sm tracking-wide text-muted-foreground">
              {column.heading}
            </span>
            {column.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-sm text-foreground hover:text-accent"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border px-4 py-4 text-center font-mono text-xs text-muted-foreground">
        {DEMO_BANNER_MESSAGE}
      </div>
    </footer>
  )
}
