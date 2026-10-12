# CLACKFORGE

**Build your clack.** A full-stack e-commerce store for custom mechanical keyboards, built around a real-time 3D configurator. The store is fictional and the engineering is real: every feature below runs against a live Postgres database, not mock data.

**Live demo:** _add the deployed URL here_ · **Source:** https://github.com/nickgriff99

> Portfolio project. No real products are sold. Checkout only ever runs in Stripe test mode (`4242 4242 4242 4242`).

Reviewing this? The "Try as admin" button on the About page signs you into the admin dashboard in one click. No account needed.

---

## What this is

Most "I built an e-commerce site" portfolio projects stop at a product grid and a cart. CLACKFORGE goes further on purpose: a real 3D keyboard you can rotate and customize key by key, a group-buy drop with database-level oversell protection proven under concurrent load, a hero where typing on your physical keyboard presses the matching key on screen, and an admin dashboard with aggregate analytics over real configurator data.

The goal was software that behaves like production software: real auth, real sessions, server-enforced price integrity, an accessibility pass, and tests at every layer.

## Features

**Shop and catalog**
- Filterable, sorted, paginated catalog across kits, switches, keycap sets, and accessories
- Generated SVG product art driven by each product's real layout and specs, so every card has imagery at zero image weight
- Product detail pages with structured data for search and social previews

**3D configurator** (`/build`)
- Procedurally generated keyboard: layouts, cases, plates, switches, keycaps, and per-key recoloring, all driven by one typed config object
- Schema-driven options and compatibility rules (incompatible combinations are disabled with an explanation, never silently hidden)
- A pure pricing engine, unit tested, that the server always re-runs at save and checkout time. The client's displayed price is never trusted
- Shareable URLs (a compact encoded config, or a saved build with its own link), undo/redo, camera presets, and a synthesized switch-sound preview
- Full keyboard navigation and a live spec-sheet readout. Everything the 3D view shows is also real, accessible text

**Home hero**
- A 3D keyboard that explodes into layers on scroll (keycaps, switches, plate, PCB, case) with spec callouts, then reassembles
- Type on your actual keyboard and watch the matching 3D key press down with sound

**Switch detail pages**
- Exploded-view 3D switch with a press/hold interaction and real sound
- Force-curve charts with a data-table fallback, and side-by-side comparison of up to three switches

**Group buy drops**
- Live countdown and stock counter, polled across browsers
- 10-minute inventory holds enforced with a database row lock, verified with a concurrent-browser test where several contexts race for the last unit and exactly one wins

**Accounts and checkout**
- Email/password and Google OAuth sharing one user table, backed by server-side sessions
- Guest cart that merges into your account on login
- Stripe Checkout (test mode), idempotent webhook handling, order history with status tracking

**Admin**
- Product and variant CRUD with inventory editing, an orders table with enforced status transitions, and a dashboard with revenue, order trends, and most-configured-option analytics from real builder data
- One-click "reset demo data" that restores the store to its seeded state

## Tech stack

| Layer | Choices |
| --- | --- |
| Client | Vite, React 19, TypeScript (strict), React Router |
| 3D | three.js via `@react-three/fiber` + `@react-three/drei` |
| UI | Tailwind CSS v4, shadcn/ui + Base UI primitives (restyled to brand tokens) |
| Client state | Zustand (cart, configurator) + TanStack Query (server state) |
| Server | Node.js, Express 5, TypeScript |
| Database | PostgreSQL via Prisma (developed against Supabase) |
| Auth | Passport.js (local + Google OAuth), server-side sessions (`express-session` + `connect-pg-simple`) |
| Payments | Stripe Checkout, test mode, idempotent webhook handling |
| Email | Resend |
| Validation | Zod: one schema package shared by client and server, no duplicated types |
| Testing | Vitest (unit, integration), Playwright + axe-core (end-to-end and accessibility) |
| CI/CD | GitHub Actions, Render |

## Architecture

```
/client   Vite + React SPA: routes, components, 3D scenes, client state
/server   Express API: routes, Prisma models, auth, Stripe webhook
/shared   Zod schemas and the pricing engine, imported by both sides
/docs     Brand guide, original plan, and project spec
```

Client and server never redefine a shape independently. Every request and response is validated against the same Zod schema both sides import from `/shared`. The pricing engine lives there too, so the server can re-run the exact calculation the client used and reject anything that does not match.

A few decisions worth calling out:

- **Price integrity end to end.** The client computes a price locally for responsiveness, but every write path (saving a build, adding to cart, checking out) recomputes it server-side from the same shared function. A tampered request is rejected, not silently accepted.
- **Oversell prevention under real concurrency.** The group-buy drop uses a row-level lock inside a database transaction, not an optimistic check. A Playwright test opens independent browser contexts and fires simultaneous reservations at the last unit. Exactly one succeeds.
- **Everything 3D is also text.** The configurator and switch pages mirror every spec, price, and selection the canvas shows as labeled, screen-reader-accessible markup. `prefers-reduced-motion` is honored throughout: scroll animations and camera tweens become instant cuts, not just faster ones.
- **Route-level code splitting.** Every page is lazy-loaded, and the 3D engine only loads on routes that render a scene.
- **Zero image weight.** Product art is generated SVG from the same layout data that drives the 3D scene, so the catalog never waits on image downloads and always matches the product.

### Security

- `helmet` secure headers on every response
- Cookie sessions: `httpOnly`, `Secure` and `SameSite=None` in production, 7-day expiry, server-side store
- CSRF defense: state-changing requests with an `Origin` other than the configured client are rejected with 403, plus a CORS allowlist with credentials
- Rate limiting (`express-rate-limit`) on login/register, the demo-admin endpoint, and the API as a whole
- Passwords hashed with bcrypt (cost 12); the hash never leaves the server
- Every input validated with Zod; the Stripe webhook verifies its signature against the raw body

## Running it locally

**Prerequisites:** Node 20+ and a PostgreSQL database. A local Postgres 16 works, and so does a free [Supabase](https://supabase.com) project.

### 1. Install dependencies

```sh
cd shared && npm install && cd ..
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Configure the server

```sh
cd server
cp .env.example .env
```

Set `DATABASE_URL` and generate a real `SESSION_SECRET` (`openssl rand -base64 32`). For Supabase, use the **Session pooler** string (port 5432); `.env.example` explains why. `CLIENT_ORIGIN` can stay at its default for local dev.

Google OAuth, Stripe, and Resend keys are optional locally. Email/password auth works without them, checkout fails gracefully with a clear message, and confirmation emails log to the console instead of sending.

### 3. Run migrations and seed

```sh
npm run prisma:migrate
npm run prisma:seed
```

### 4. Start both apps

```sh
# terminal 1
cd server && npm run dev      # http://localhost:3000

# terminal 2
cd client && npm run dev      # http://localhost:5173
```

A seeded admin account is available after seeding: `admin@clackforge.test` / `AdminDemo123!`.

### 5. Tests

```sh
cd shared && npm test
cd server && npm test
cd server && npm run test:integration   # real Postgres: group-buy row-lock race
cd client && npm test                   # unit tests
cd client && npm run test:e2e           # Playwright: user flows + accessibility
```

Typecheck, lint, and unit tests for all three packages run in CI on every push (`.github/workflows/ci.yml`). The Playwright suite needs a seeded database, so it runs locally.

## Deploying

`render.yaml` describes the Express API (web service) and the Vite build (static site). The database is hosted on Supabase rather than Render, because Render's free Postgres is deleted after 30 days. In the Render dashboard choose **New, then Blueprint**, point it at this repo, and apply. `SESSION_SECRET` generates automatically. Set `DATABASE_URL` (Supabase Session pooler string) in the dashboard, along with any Google OAuth, Stripe, and Resend keys.

The static site proxies `/api/*` to the API, so the browser only talks to one origin and the session cookie stays first-party. That keeps sign-in working in Safari and private windows, which block third-party cookies. If Render appends a suffix to a service name, update `CLIENT_ORIGIN` and the `/api` rewrite destination to match.

After the first deploy, seed the database once with `npm run prisma:seed` from `server/` using the same `DATABASE_URL`. Without the seed, "Try as admin" has no account to sign into.

Optional client build variables: `VITE_REPO_URL` and `VITE_LIVE_URL` control the links on the About page. Replace the `clackforge.example` origin in `client/public/robots.txt` and `client/public/sitemap.xml` with your real domain.

## Known limitations

- **Mobile performance on the 3D-heavy routes** is the main gap. This is a client-rendered SPA with no server-rendering tier, so there is an unavoidable blank window before the bundle downloads on a throttled connection. Closing it further would mean revisiting the rendering strategy.
- Stripe and Resend run in test mode or log-only mode unless you supply keys.

## License

[MIT](LICENSE)
