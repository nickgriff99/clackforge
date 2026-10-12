import { ApiErrorSchema } from "@shared"
import type { RequestHandler } from "express"

/**
 * General-shape 401 guard for every session-gated route - `GET /api/auth/me`
 * as well as cart/checkout/order routes all use this same middleware with
 * the same `UNAUTHORIZED` code; don't invent a per-route variant.
 *
 * `req.isAuthenticated()` comes from Passport's session middleware
 * (`passport.session()`, wired in src/app.ts after express-session) - it's
 * false whenever there's no session, an expired session, or a session whose
 * `deserializeUser` lookup came back empty (deleted user, see
 * src/config/passport.ts).
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    res.status(401).json(ApiErrorSchema.parse({ error: { message: "Authentication required", code: "UNAUTHORIZED" } }))
    return
  }
  next()
}
