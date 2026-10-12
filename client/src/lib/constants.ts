import type { ProductSummary, ProductType } from "@shared"

/**
 * Brand + copy constants. See docs/BRAND.md for the full brand doc.
 */

export const BRAND_NAME = "CLACKFORGE"
export const BRAND_TAGLINE = "Build your clack."

export const DEMO_BANNER_MESSAGE =
  "Portfolio demo. No real products are sold. Use Stripe test card 4242 4242 4242 4242."

/** sessionStorage key - banner dismissal is per-browser-session, not permanent. */
export const DEMO_BANNER_STORAGE_KEY = "clackforge:demo-banner-dismissed"

/** next-themes storage key (localStorage - theme preference persists across sessions). */
export const THEME_STORAGE_KEY = "clackforge:theme"

export interface NavItem {
  label: string
  to: string
}

export const PRIMARY_NAV: NavItem[] = [
  { label: "Shop", to: "/shop" },
  { label: "Build", to: "/build" },
  { label: "Account", to: "/account" },
]

/**
 * Catalog browsing labels. `CUSTOM_BUILD` (configurator output) is
 * deliberately excluded from `BROWSABLE_PRODUCT_TYPES` below - no seeded
 * product uses it, so offering it as a Shop filter would always return an
 * empty result. It still needs a label here since `ProductType` covers it.
 */
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  KIT: "Kits",
  SWITCH: "Switches",
  KEYCAP_SET: "Keycap sets",
  ACCESSORY: "Accessories",
  CUSTOM_BUILD: "Custom builds",
}

export const BROWSABLE_PRODUCT_TYPES: ProductType[] = ["KIT", "SWITCH", "KEYCAP_SET", "ACCESSORY"]

/**
 * SWITCH-category products link to the showpiece page (`/switches/:slug` -
 * exploded view, press interaction, force curve) instead of the plain shop
 * PDP. Every other category is unaffected - `/shop/:slug` stays the link
 * target for them, and stays directly reachable on its own for switches
 * too (the showpiece page itself links back via its "Shop this switch"
 * button).
 *
 * Lives here (not in `ProductCard.tsx`) so it's a plain shared helper, not
 * a second export dragging a component file's Fast Refresh boundary
 * around - every "navigate to a product" call site should import this one
 * function rather than re-deriving the rule; `ProductCard.tsx` and
 * `ProductSearch.tsx` both do.
 */
export function productHref(product: ProductSummary): string {
  return product.category === "SWITCH" ? `/switches/${product.slug}` : `/shop/${product.slug}`
}

export const FOOTER_NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Shop",
    items: [
      { label: "All keyboards", to: "/shop" },
      { label: "Start a build", to: "/build" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Your account", to: "/account" },
      { label: "Cart", to: "/cart" },
      // Added into this existing column deliberately - a new footer
      // column would break the 3-column grid sizing in Footer.tsx.
      { label: "About", to: "/about" },
    ],
  },
]
