# Project Spec: 3D Custom Mechanical Keyboard Store

## 0. Goal

The goal is a **fully functional, fictional e-commerce store** for custom mechanical keyboards whose signature feature is a **real-time 3D keyboard configurator**. It should look like an award-gallery site (Awwwards / Godly quality) and behave like a real store: browse, configure, add to cart, check out with Stripe test mode, see the order in an account page, and manage inventory in an admin view.

Quality bar: a hiring manager should be able to click through the entire purchase path on a phone without hitting a dead end, a placeholder, or a console error.

### Hard rules
- **Mobile-first.** Design and build every component at 375px first, then scale up. Never treat mobile as an afterthought.
- **DRY.** Options, prices, compatibility rules, and copy live in typed config/data, not scattered across components. If a pattern appears twice, extract it.
- **TypeScript strict mode.** No `any` unless justified in a comment.
- **No real brands.** Do not use real trademarks (switch, keycap, or keyboard brand names). Invent all product names.
- **Demo honesty.** A slim, dismissible-per-session banner on every page: "Portfolio demo. No real products are sold. Use Stripe test card 4242 4242 4242 4242." Checkout must only ever run in Stripe test mode.
- **No placeholder text** ("Lorem ipsum", "Product 1") in anything shipped. Write real, on-brand copy.
- Never stub a feature silently. If something is stubbed, list it in the phase summary.

---

## 0.5 Baseline requirements (MUST PASS, these override anything below)

These are the minimum course requirements. Every item must work end to end before any showpiece feature is considered done. If a later section conflicts with this list, this list wins.

| # | Requirement | Acceptance criteria |
|---|---|---|
| 1 | Plan the project | `PLAN.md` with wireframes or a sitemap, data model, and route list, written before code |
| 2 | React project setup | Vite + React + TypeScript with the folder structure in section 8 |
| 3 | React Router | All client routes use React Router (nested layouts, 404 route, protected route wrapper) |
| 4 | Registration page | Email + password signup with validation, hashed passwords (bcrypt/argon2), duplicate-email error |
| 5 | Login page | Email + password login with clear error states |
| 6 | Third-party login | At least Google OAuth (Passport.js strategy), linked to the same user table |
| 7 | Session support | Server-side sessions (express-session + Postgres session store); user stays logged in across refresh |
| 8 | Logout | Destroys the session server-side, clears client state, redirects |
| 9 | Products listing page | Loaded from the API/database, not hardcoded |
| 10 | Product details page | Route per product (`/products/:id`), loaded from the API |
| 11 | Track cart items | Add/update/remove from the details page; cart persists to the database for logged-in users |
| 12 | Checkout flow | Shows cart summary, takes payment via Stripe **test mode**, creates an order |
| 13 | Protected resources | Account, order history, saved builds, and checkout require auth; API returns 401 and the client redirects to login |
| 14 | Order history | Logged-in users see past orders and order details |
| 15 | Deploy to Render | Frontend as a Render static site, API as a Render web service, Postgres on Render; README has the live URL |

Build order: phases 1, 2 and 5 in section 10 cover these and must be complete and deployed to Render before phases 3, 4 and 6 begin.

---

## 1. Brand

- Name: `[BRAND NAME]` (fictional; pick something short and ownable, check it isn't a real keyboard company).
- Personality: precise, tactile, a little nerdy, confident. Think lab instrument meets boutique audio gear.
- Visual direction: dark-first UI (with a full light theme), warm off-white and graphite neutrals, ONE saturated accent color used sparingly. Large condensed display type for headings, a clean grotesk for body, a monospace for specs and prices.
- Texture: subtle grain, hairline borders, spec-sheet style tables, technical callouts with leader lines in the 3D views.
- Motion: purposeful and physical (spring-based, keys "press" with weight). Respect `prefers-reduced-motion` everywhere: replace motion with instant state changes or fades.

Create a design token file (colors, type scale, spacing, radii, shadows, motion durations/easings) and use it everywhere. Both themes are driven by CSS variables.

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Frontend | Vite + React + TypeScript, React Router |
| Backend | Node + Express REST API (TypeScript), Passport.js (local + Google OAuth), express-session with connect-pg-simple |
| Styling | Tailwind CSS with design tokens as CSS variables |
| UI primitives | shadcn/ui (dialogs, sheets, tabs, select, toast, forms, data table, command menu) restyled to the brand. Do not ship shadcn defaults unstyled. |
| Signature effects | React Bits, used sparingly: max ~4 effects site-wide (e.g., one hero text effect, one marquee, one card hover effect, one cursor/spotlight effect). Every effect must have a reduced-motion fallback. |
| 3D | three.js via @react-three/fiber + @react-three/drei; postprocessing only if it stays within the performance budget |
| Animation | Framer Motion (UI), GSAP or R3F springs (3D) |
| State | Zustand for cart and configurator; TanStack Query for server data |
| Forms/validation | React Hook Form + Zod; share Zod schemas between client and server (shared package or folder) |
| Database | Postgres on Render with Prisma or Drizzle |
| Auth | See section 0.5: email/password registration + Google OAuth, server sessions; guest browsing allowed, checkout requires login |
| Payments | Stripe Checkout or Payment Element, **test mode only**, with webhooks |
| Email | Resend (or similar) for order confirmation, sent to the buyer's address in test |
| Audio | Web Audio API for switch sound previews |
| Testing | Vitest (unit), Playwright (E2E), axe (a11y) |
| CI/CD | GitHub Actions (lint, typecheck, test) + Render auto-deploy from main (static site + web service + Postgres) |

---

## 3. Information architecture

1. **Home**
2. **Shop** (all products, filterable)
3. **Configurator** (`/build`) the signature page
4. **Switches** listing + switch detail pages
5. **Keycaps** listing + keycap set detail pages
6. **Cases / Kits** listing + detail pages
7. **Group Buy** (`/drop/[slug]`) limited-run keycap set with live stock
8. **Cart** (slide-over sheet + full page)
9. **Checkout** (Stripe) → **Order confirmation**
10. **Account**: orders, saved builds, addresses, profile
11. **Shared build page** (`/b/[id]` or URL-encoded config) viewable by anyone
12. **Admin** (role-protected): products, inventory, orders, group buy controls
13. **About / Case Study**: how this project was built (written for recruiters)
14. **Support**: FAQ, shipping/returns (fictional), contact form (stores to DB)
15. **Legal**: privacy, terms (short, clearly demo)
16. **404 and 500** pages with personality (e.g., a 3D keycap labeled "404" you can press)

Global: header with search (shadcn Command menu, `/` shortcut), cart count, theme toggle, account; footer with newsletter signup (stored in DB, double-opt-in email optional).

---

## 4. Signature 3D features

### 4.1 Hero (Home)
- A full 3D keyboard that **explodes into layers on scroll** (keycaps → switches → plate → PCB → case), with spec callouts appearing at each layer, then reassembles.
- **Physical keyboard input**: when the user types on their real keyboard, the matching 3D key presses down and plays the selected switch sound. Show a subtle hint: "Try typing."
- On mobile: tap keys to press them; scroll-driven explode still works; lower geometry detail.

### 4.2 Configurator (`/build`)
Step-based flow (stepper on mobile, side panel on desktop), with the 3D model always visible:

1. **Layout**: 60%, 65%, 75%, TKL (procedurally generated from a layout definition, not hand-modeled)
2. **Case**: material (aluminum, polycarbonate, wood), color, finish (anodized, frosted, matte)
3. **Plate**: material (affects sound profile metadata)
4. **Switches**: linear / tactile / clicky, from the switch catalog
5. **Keycaps**: profile (cylindrical, spherical, flat), colorway set, legend style
6. **Per-key customization**: select one or more keys and recolor them; preset accent patterns (e.g., accent Esc + Enter + arrows)
7. **Extras**: cable color, artisan keycap, stabilizer tuning add-on
8. **Review**: rotating turntable view, full spec sheet, itemized price, add to cart, save build, share

Configurator requirements:
- **Single source of truth**: one typed `BuildConfig` object in Zustand. The 3D scene, price, spec sheet, and URL all derive from it.
- **Schema-driven options**: every step is rendered from an options definition file (`options.ts`) containing ids, labels, price deltas, swatch values, and compatibility rules. Adding a new case color must require editing data only, not components.
- **Pure pricing engine**: `calculatePrice(config, catalog) → { lineItems, subtotal }` with unit tests. The server recalculates price at checkout; never trust the client price.
- **Compatibility rules**: e.g., certain keycap sets don't support certain layouts, wood cases only in some colors. Incompatible options are disabled with a tooltip explaining why, never silently hidden.
- **URL state**: config serializes to a compact, versioned URL param so any build is shareable and survives refresh. Invalid/old URLs fall back gracefully with a toast.
- **Saved builds**: logged-in users save named builds to their account; guests get a prompt to sign in to save.
- **Share**: generates a link; optionally an Express endpoint that renders a 2D PNG preview of the build for link previews.
- **Undo/redo** for configurator changes (keyboard shortcuts on desktop).
- **Camera presets**: top, angled, side profile, close-up on a key; smooth transitions.
- **Sound test**: type in a small text field or tap keys; plays the chosen switch's sound sample with slight random pitch variation so it doesn't sound robotic.

### 4.3 Switch detail pages
- 3D switch with **exploded view** (stem, spring, top/bottom housing) via a slider.
- **Force curve chart** (actuation, bottom-out, travel) drawn from switch data.
- "Press" interaction: click/hold to animate the stem with the matching sound.
- Side-by-side **compare** up to 3 switches (specs table + overlaid force curves).

### 4.4 Keycap set detail pages
- 3D keycap row showing the colorway and profile; toggle between profile shapes.
- Kit breakdown (base, alphas, mods, novelties) as selectable add-ons.

### 4.5 Group Buy / Drop page
- Countdown to open/close, limited stock counter that updates in **real time** across browsers (Supabase Realtime, websockets, or polling fallback).
- **Inventory reservation**: adding the drop item to cart reserves a unit for 10 minutes; reservations expire automatically; overselling must be impossible (database transaction / row lock). Write a test that simulates two buyers racing for the last unit.
- States: upcoming, live, sold out, closed. Admin can open/close a drop and set stock.

### 4.6 Performance budget for 3D (non-negotiable)
- Instanced meshes for keycaps; procedural geometry where possible; compressed textures; Draco/meshopt for any GLB.
- Lazy-load the 3D canvas; show a designed static poster image until it's ready.
- Adaptive quality: drop DPR, shadows, and postprocessing on low-end/mobile (drei `PerformanceMonitor`).
- Pause rendering when the canvas is offscreen (`frameloop="demand"` where possible).
- **Fallback**: if WebGL is unavailable or performance stays poor, show a 2D layered SVG/image configurator that still works fully.
- Targets: 3D canvas interactive in under ~3s on a mid-range phone over 4G; steady 60fps desktop, 30fps+ mobile.

---

## 5. Commerce functionality

### Catalog
- Product types: `KIT` (case + plate + PCB), `SWITCH` (sold in packs of 10/70/90), `KEYCAP_SET`, `ACCESSORY`, and `CUSTOM_BUILD` (configurator output).
- Variants with their own SKU, price, and stock.
- Seed script with ~30 products of realistic, invented data (names, specs, descriptions, prices). Product images can be renders from the 3D scene.

### Shop / search
- Filters (type, switch feel, layout, price range, in stock), sorting, URL-synced filter state, pagination or infinite scroll.
- Global search (Command menu) across products and pages.
- Empty states that are designed, not blank.

### Cart
- Slide-over sheet + full page; quantity changes, remove, undo remove (toast).
- Persists for guests (local) and syncs to the DB on login (merge logic for conflicts).
- Custom builds appear as one line item with an expandable spec summary and a thumbnail.
- Promo codes (e.g., `PORTFOLIO10`) validated server-side.
- Shipping estimate and tax estimate (fictional flat rules, clearly labeled).
- Free-shipping progress bar.

### Checkout
- Stripe test mode. Server builds line items from the DB and recalculates every price.
- Webhook (`checkout.session.completed` or equivalent) creates the order, decrements stock, clears reservations, sends the confirmation email. Webhook must be idempotent.
- Order confirmation page with a **signature tactile moment** (e.g., an animated printed receipt or a keycap "stamp" of the order number) plus order summary.

### Account
- Order history with status timeline (Placed → Building → Shipped → Delivered; admin advances it).
- Saved builds (open in configurator, rename, delete, share).
- Address book, profile, sign out.

### Admin (role-protected)
- Products/variants CRUD with stock editing.
- Orders table (shadcn data table) with status updates.
- Group buy controls.
- Simple dashboard: revenue (test), orders over time chart, top-configured options (aggregate configurator data, a nice talking point).
- A **"Reset demo data"** button that reseeds the database so reviewers can always get a clean store.

### Recruiter-friendly demo mode
- A "Try as admin" login on the About/Case Study page that signs into a sandboxed demo admin account (cannot delete the seed products permanently; reset restores everything).

---

## 6. Accessibility (WCAG 2.2 AA)

- All configurator controls are real buttons/radios/selects with labels; full keyboard navigation through every step.
- The 3D canvas is decorative-plus: everything it shows is also available as text (spec sheet, live region announcing changes like "Case color changed to Graphite. Total $284").
- Visible focus states, color contrast checked in both themes, color swatches have text names.
- `prefers-reduced-motion`: disables explode-on-scroll animation (show layers statically), camera tweens become cuts, React Bits effects disabled.
- Sound never autoplays; a global mute toggle persists.
- axe checks in Playwright on every major page.

---

## 7. SEO, metadata, and polish

- Per-page titles/meta via a head manager (e.g., react-helmet-async), Product structured data on product pages, sitemap, robots.
- Static OG image for the site; product images used as OG images where possible.
- Favicon set and web app manifest.
- Loading skeletons designed to match final layouts (no layout shift; CLS < 0.1).
- Toasts for every async action; error boundaries with friendly recovery.
- Lighthouse targets (mobile): Performance 85+ (pages without 3D 95+), Accessibility 100, Best Practices 100, SEO 100.

---

## 8. Code architecture

```
/client              Vite + React app
  /src/routes        React Router route modules and layouts: (shop), (account), (admin)
  /src/components/ui shadcn primitives (restyled)
/server              Express API: routes, controllers, Passport config, Stripe webhook
/shared              Zod schemas, types, pricing engine (used by client AND server)
```

Within `/client/src` (and `/shared` for pricing, catalog and validation):

```
/components/ui       shadcn primitives (restyled)
/components/effects  React Bits effects, each wrapped with a reduced-motion guard
/components/three    R3F scene pieces: Keyboard, Keycap, Switch, Case, CameraRig, Lights
/features/configurator  steps, store, URL codec, undo/redo
/features/cart
/features/checkout
/lib/catalog         options.ts, layouts.ts (key positions), compatibility.ts
/lib/pricing         calculatePrice + tests
/lib/db              schema, queries, seed
/lib/validation      shared Zod schemas
/lib/audio           switch sound player
/tests/e2e           Playwright
```

- Keyboard layouts are data: arrays of `{ id, label, x, y, width, height, row }`. One `<Keyboard layout={...} />` renders any layout.
- One generic `<OptionStep>` component renders any configurator step from its options definition.
- Express route handlers validate every request body with the shared Zod schemas.
- The Stripe webhook route uses the raw request body and is mounted before `express.json()`.
- Configure CORS and cookies for a separate frontend/API origin on Render (`credentials: true`, `sameSite`/`secure` set correctly), or proxy `/api` through the static site so cookies stay first-party.
- Environment variables documented in `.env.example`. No secrets committed.

---

## 9. Testing

- **Unit (Vitest)**: pricing engine, compatibility rules, URL codec (round-trip + old version migration), cart merge logic, promo validation.
- **E2E (Playwright)**, run on a mobile viewport AND desktop:
  1. Configure a keyboard → add to cart → checkout with test card → confirmation page → order appears in account.
  2. Share a build URL → open in a fresh context → identical config.
  3. Group buy: two contexts race for the last unit → exactly one succeeds.
  4. Guest cart → log in → cart merges correctly.
  5. Admin changes stock → shop reflects it.
- **a11y**: axe on home, shop, product, build, cart, checkout return, account.
- CI fails on lint, typecheck, or test failure.

---

## 10. Phases (stop after each one)

1. **Foundation**: PLAN.md, repo, tooling, design tokens, both themes, layout shell (header/footer/demo banner), React Router setup, shadcn restyle, Express API skeleton, DB schema + seed, CI, first deploy to Render. Deliverable: live Render URL with styled empty pages and a working health-check endpoint.
2. **Catalog & cart**: shop, filters, search, product pages (2D first), cart sheet/page with persistence.
3. **3D core**: procedural keyboard from layout data, keycap/switch components, camera rig, performance monitor, WebGL fallback, poster images.
4. **Configurator**: all steps, schema-driven options, compatibility, pricing engine + tests, URL state, undo/redo, sound test, save/share, OG images.
5. **Checkout & accounts** (do this immediately after phase 2, before phases 3 and 4): registration, login, Google OAuth, sessions, logout, protected routes, Stripe test checkout, webhook, order creation, order history, emails, confirmation moment, account pages. Deliverable: every item in section 0.5 passes on the live Render URL.
6. **Showpieces**: home hero explode-on-scroll + physical keyboard input, switch exploded view + force curves + compare, group buy with realtime stock and reservations.
7. **Admin & demo mode**: admin CRUD, orders, dashboard, reset demo data, "Try as admin."
8. **Hardening**: full Playwright suite, a11y pass, Lighthouse pass, reduced-motion audit, error/empty states, 404/500, SEO.
9. **Case study page + README**: architecture diagram, key decisions and trade-offs, hardest problems (procedural 3D, oversell prevention, price integrity), performance numbers, screenshots/GIFs, links to repo and live demo.

At the end of every phase report: what was built, what's stubbed, known issues, and how to test it manually.

---

## 11. Definition of done

- Every row in section 0.5 passes its acceptance criteria on the live Render deployment.
- A stranger on a phone can complete the full purchase path with a test card in under 2 minutes without guidance.
- Every option in the configurator changes the 3D model, the spec sheet, the price, and the URL.
- No console errors, no unstyled shadcn defaults, no placeholder copy.
- All tests pass in CI; Lighthouse and a11y targets met.
- The README and case study explain *why* things were built the way they were.