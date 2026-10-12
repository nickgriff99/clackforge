import cors from "cors"
import express, { type Express } from "express"
import morgan from "morgan"
import passport from "passport"
import { env } from "./config/env"
import { configurePassport } from "./config/passport"
import { warnIfResendNotConfigured } from "./lib/email"
import { warnIfStripeNotConfigured } from "./lib/stripe"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"
import { apiLimiter, requireTrustedOrigin, securityHeaders } from "./middleware/security"
import { sessionMiddleware, touchSession } from "./middleware/session"
import { adminDashboardRouter } from "./routes/adminDashboard"
import { authRouter } from "./routes/auth"
import { buildsRouter } from "./routes/builds"
import { cartRouter } from "./routes/cart"
import { checkoutRouter } from "./routes/checkout"
import { dropsRouter } from "./routes/drops"
import { healthRouter } from "./routes/health"
import { ordersRouter } from "./routes/orders"
import { productsRouter } from "./routes/products"
import { webhooksRouter } from "./routes/webhooks"

export function createApp(): Express {
  const app = express()

  // Registers Passport's local + (if configured) Google strategies and the
  // session serialize/deserialize hooks. Must run before `passport.session()`
  // below is ever hit by a request. Safe to call on every createApp() (tests
  // construct the app repeatedly) - passport.use()/serializeUser()/
  // deserializeUser() just re-register, no duplicate-session side effect.
  configurePassport()

  // Same "warn once at boot, fail gracefully per-request" pattern as the
  // Google OAuth check above - no real Stripe/Resend keys exist yet.
  warnIfStripeNotConfigured()
  warnIfResendNotConfigured()

  // Render terminates TLS at its edge proxy. Without this, `req.secure` is
  // always false behind it, which would silently stop the `secure: true`
  // session cookie from ever being set in production. The hop count is
  // configurable because the deployed static site proxies /api to this
  // service, which adds one more proxy in front of Express (see render.yaml).
  app.set("trust proxy", env.TRUST_PROXY_HOPS)

  /**
   * CORS/cookie strategy: in production the static site rewrites `/api/*` to
   * this service (see render.yaml), so the browser only ever talks to one
   * origin and the session cookie is first-party. That matters because
   * Safari and private browsing windows block third-party cookies outright.
   * CORS is still configured with an explicit allowlist for local dev, where
   * the client (5173) and API (3000) are different origins on the same site,
   * and for any direct API access. Cross-origin cookies need
   * `SameSite=None; Secure`, so session.ts branches on NODE_ENV.
   */
  app.use(securityHeaders)
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))

  // Keep request-access logs out of test runs (vitest + supertest) - noisy,
  // not useful signal for a test failure.
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"))
  }

  /**
   * The Stripe webhook needs Express's raw, unparsed request body -
   * `stripe.webhooks.constructEvent` hashes the exact original bytes to
   * verify the signature. This router's raw-body parser is scoped to only
   * `/api/webhooks/stripe` (see routes/webhooks.ts) and must be mounted
   * here, before the app-wide `express.json()` call below - get this
   * ordering wrong and every webhook event fails signature verification
   * with no obvious error pointing at middleware order.
   */
  app.use(webhooksRouter)

  // After the webhook router on purpose: Stripe is server-to-server, so it
  // is neither rate limited nor subject to the browser Origin check.
  app.use("/api", apiLimiter)
  app.use(requireTrustedOrigin)

  app.use(express.json())

  // /health first: no session/DB dependency, see routes/health.ts.
  app.use(healthRouter)

  app.use(sessionMiddleware)
  app.use(touchSession)
  // Passport's session hooks ride on top of express-session, not instead of
  // it - `passport.session()` reads `req.session.passport.user` (the id
  // `serializeUser` stored) and calls `deserializeUser` to attach `req.user`
  // per request. Must be mounted AFTER sessionMiddleware.
  app.use(passport.initialize())
  app.use(passport.session())

  app.use(authRouter)
  app.use(productsRouter)
  // Every route on this router already carries its own
  // `requireAuth, requireAdmin` pair, so mount position doesn't matter for
  // auth - kept here for consistency with the other `/api/admin/*` surfaces.
  app.use(adminDashboardRouter)
  // `cartRouter`/`ordersRouter` apply `requireAuth` per-route rather than
  // with a blanket `router.use()`, so mount order here doesn't gate access -
  // kept in roughly request-flow order for readability.
  app.use(buildsRouter)
  app.use(dropsRouter)
  app.use(cartRouter)
  app.use(checkoutRouter)
  app.use(ordersRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
