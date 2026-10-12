# CLACKFORGE - Project Plan

Planning doc for the initial scaffold, written before the first line of code per the project's own baseline requirement #1.

## 1. Sitemap / routes (Phase 1 subset)

All routes nest under a single `RootLayout` (header, footer, demo-honesty banner, theme provider, toast host).

| Path | Page | Rendering | Notes |
| --- | --- | --- | --- |
| `/` | Home | Client-rendered SPA | Hero, brand story, featured drop teaser, CTA into Shop/Build |
| `/shop` | Shop | Client-rendered | Catalog grid, on-brand empty/stub copy (no live product data yet - contract lands next) |
| `/shop/:slug` | Product detail | Client-rendered | Stub detail layout keyed by slug param; renders spec sheet in monospace |
| `/build` | Build (configurator entry) | Client-rendered | Explains the configurator flow; actual 3D/step UI is `features/configurator`, built in a later phase |
| `/cart` | Cart | Client-rendered | Empty-state cart (no persistence wired yet) |
| `/account` | Account | Client-rendered, behind `ProtectedRoute` | Stub auth check (real auth comes later); unauthenticated view shows an honest "sign in required" card, not a dead redirect |
| `*` | 404 | Client-rendered | On-brand not-found page |

**Rendering strategy:** this is a Vite + React Router **client-rendered SPA** shipped as a static site (Render static site, not a Node server) - there is no server-rendering tier in this app. "Client-rendered" above means data fetching happens after mount, not that routes are build-time prerendered. Data fetching (Shop catalog, Product detail, Cart, Account) moves to live client-side fetches against the Express API once the contract and wiring land - loading/error states for those are real seams left in the route stubs.

Deferred past Phase 1 (folders stubbed, not routed yet): `/checkout` (`features/checkout`), configurator step routes under `/build/*`, account sub-routes (orders, addresses, saved builds, group-buy pledges).

## 2. Wireframes (text)

**Home (`/`)**
- Header (sticky): wordmark, nav (Shop / Build / Account), search trigger (stub), cart badge, theme toggle
- Demo-honesty banner directly under header, dismissible
- Hero: condensed display headline + one-line brand promise, primary CTA "Start a build" → `/build`, secondary CTA "Browse the shop" → `/shop`
- "Why CLACKFORGE" 3-up feature strip (quality, customization, community group-buys)
- Footer: newsletter signup (non-functional submit, labeled as such), nav columns, legal/demo disclaimer repeat

**Shop (`/shop`)**
- Page header + one-line category description
- Responsive product grid (mobile-first: 1 col @375px → up to 4 col desktop)
- Empty state: on-brand "the forge is still warming up" message (no live catalog this phase) instead of a blank screen or Lorem ipsum

**Product detail (`/shop/:slug`)**
- Breadcrumb back to Shop
- Image slot (left/top), spec sheet in monospace (right/bottom): name, price, key specs as a `key: value` list
- "Not found" fallback if `slug` doesn't resolve (stub data only this phase)

**Build (`/build`)**
- Explains the configurator (case → plate → switches → keycaps → stabilizers selection flow) without implementing the 3D view yet
- Visual placeholder panel for the future `components/three` viewport
- CTA disabled/labeled "Configurator opens in a later phase"

**Cart (`/cart`)**
- Empty-cart state (icon + copy + CTA back to Shop) - real line items land once `CartItem` contract + API exist
- Totals block shown in monospace, zeroed out, clearly a placeholder layout

**Account (`/account`)**
- `ProtectedRoute`-gated
- Unauthenticated: card explaining accounts arrive later, with context on what will live here (orders, saved builds, addresses, group-buy pledges)
- Authenticated branch unreachable this phase (stub `useAuth()` always returns signed-out) but the component branch exists as real code, not a TODO comment

**404**
- On-brand "wrong drawer in the parts bin" copy, CTA home

## 3. Data model (entities)

Fields chosen from what the Phase 1 UI stubs already assume; the final Prisma schema + Zod contracts adjust freely from here as the app grows.

- **User** - id, email, displayName, role (`customer` | `admin`), createdAt
- **Address** - id, userId, label, line1, line2?, city, region, postalCode, country, isDefault
- **Product** - id, slug, name, tagline, description, category (`kit` | `switch` | `keycap` | `accessory`), basePrice (cents), currency, images[], specs (`Record<string, string>`, rendered monospace), isConfigurable, status (`active` | `draft` | `archived`), createdAt
- **Variant** - id, productId, name, sku, priceDelta (cents), attributes (`Record<string, string>`), stock, image
- **CustomBuild** - id, userId? (nullable - guest configurator state), productId (base keyboard), selections (`Record<slot, variantId>` for case/plate/switches/keycaps/stabilizers), totalPrice (cents), name?, createdAt
- **SavedBuild** - id, userId, customBuildId, label, isPublic, createdAt
- **Cart** - id, userId? (nullable), sessionId? (guest cart key), currency, createdAt, updatedAt
- **CartItem** - id, cartId, productId, variantId? | customBuildId? (exactly one set), quantity, unitPrice (cents, snapshot at add-time), lineTotal
- **Order** - id, userId? (guest checkout allowed), orderNumber, status (`pending` | `paid` | `fulfilled` | `cancelled`), subtotal, tax, shipping, total, currency, shippingAddressId, billingAddressId, placedAt, stripePaymentIntentId (test mode only)
- **OrderItem** - id, orderId, productId, variantId/customBuildId (snapshot ref), name (snapshot), unitPrice, quantity, lineTotal
- **GroupBuyDrop** - id, productId?, name, description, targetUnits, pledgedUnits, pricePerUnit, startsAt, endsAt, status (`upcoming` | `live` | `funded` | `expired`), estimatedShipDate

## 4. Folder structure (`/client/src`)

```
routes/        Home, Shop, ShopProduct, Build, Cart, Account, NotFound,
               RootLayout, route config (index.tsx)
components/
  ui/          shadcn primitives, restyled to brand tokens
  layout/      Header, Footer, DemoBanner, ThemeToggle
  effects/     stub - post-phase-1 visual/motion effects
  three/       stub - post-phase-1 3D configurator viewport
features/
  configurator/ stub - Build flow logic, later phase
  cart/         stub - cart state/logic, later phase
  checkout/     stub - Stripe test-mode checkout, later phase
lib/
  utils.ts     shadcn `cn` helper
  auth.tsx     stub `useAuth()` + `ProtectedRoute`
  types.ts     shared-shape placeholders (BuildConfig, CartSnapshot,
               ProductSummary) - explicitly marked TODO/seam
  constants.ts brand name, nav items, demo banner copy
```

## 5. Brand

See `BRAND.md` for the full brand/token doc. Short version: store name is **CLACKFORGE** - dark industrial workshop default theme (forge-amber primary, switch-LED-cyan accent), condensed display type for headings, monospace for every spec and price.
