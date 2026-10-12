import {
  ApiErrorSchema,
  AuthResponseSchema,
  LoginInputSchema,
  RegisterInputSchema,
  SessionResponseSchema,
  type AuthUser,
} from "@shared"
import type { User as PrismaUser } from "@prisma/client"
import { hash } from "bcryptjs"
import { Router } from "express"
import passport from "passport"
import { DEMO_ADMIN_EMAIL } from "../config/demoAdmin"
import { env } from "../config/env"
import { prisma } from "../db/prisma"
import { logger } from "../lib/logger"
import { authLimiter, demoAdminLimiter } from "../middleware/security"

export const authRouter = Router()

// Cost factor 12: reasonable modern default. bcryptjs (pure JS) was chosen
// over native `bcrypt` to avoid a node-gyp/native-build dependency on this
// Windows dev box.
const BCRYPT_ROUNDS = 12

/** Maps the server-internal Prisma row to the wire-safe shape. Never send `hashedPassword`/`googleId`. */
function toAuthUser(user: PrismaUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role === "ADMIN" ? "admin" : "customer",
  }
}

/**
 * `RegisterInputSchema.displayName` is optional but `User.displayName` is
 * not nullable in schema.prisma, so the fallback is the email's local-part
 * before `@`. Falls back to the full email in the pathological case of an
 * empty local-part (shouldn't happen past `z.string().email()`, but keeps
 * this function total rather than possibly returning `""`).
 */
function deriveDisplayName(email: string, displayName?: string): string {
  if (displayName) return displayName
  return email.split("@")[0] || email
}

// Plain async handler, matching src/routes/products.ts's convention - Express
// 5 forwards a rejected promise from an async handler to `next(err)`
// automatically, so the try/catch below only needs to handle the explicit
// early-return (409) path; everything else (ZodError, Prisma errors) falls
// through to errorHandler on its own.
authRouter.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const input = RegisterInputSchema.parse(req.body)

    // Checked BEFORE insert per contract - a clean 409, not a caught
    // Postgres unique-constraint error surfacing as a 500/ugly message.
    const existing = await prisma.user.findUnique({ where: { email: input.email } })
    if (existing) {
      res
        .status(409)
        .json(ApiErrorSchema.parse({ error: { message: "An account with this email already exists", code: "EMAIL_TAKEN" } }))
      return
    }

    const hashedPassword = await hash(input.password, BCRYPT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        email: input.email,
        hashedPassword,
        displayName: deriveDisplayName(input.email, input.displayName),
      },
    })

    // Locked behavior: registering also establishes a session (same
    // Set-Cookie as login) so the user isn't forced to log in twice.
    req.login(user, (err) => {
      if (err) {
        next(err)
        return
      }
      res.status(201).json(AuthResponseSchema.parse({ user: toAuthUser(user) }))
    })
  } catch (err) {
    next(err)
  }
})

authRouter.post("/api/auth/login", authLimiter, (req, res, next) => {
  // Validate shape BEFORE handing off to Passport: a malformed email/short
  // password must 400 VALIDATION_ERROR, not fall into the local strategy and
  // come back as a 401 INVALID_CREDENTIALS (wrong code for a shape failure).
  try {
    LoginInputSchema.parse(req.body)
  } catch (err) {
    next(err)
    return
  }
  // `req.body` already validated above (same `email`/`password` field names
  // the local strategy reads from `req.body` by default) - passing a custom
  // callback instead of `{ session: true }` lets this route own the
  // response shape (401 + INVALID_CREDENTIALS) instead of Passport's default
  // failure redirect.
  passport.authenticate("local", (err: unknown, user: PrismaUser | false) => {
    if (err) {
      next(err)
      return
    }
    if (!user) {
      res
        .status(401)
        .json(ApiErrorSchema.parse({ error: { message: "Email or password is incorrect", code: "INVALID_CREDENTIALS" } }))
      return
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        next(loginErr)
        return
      }
      res.status(200).json(AuthResponseSchema.parse({ user: toAuthUser(user) }))
    })
  })(req, res, next)
})

authRouter.post("/api/auth/logout", (req, res, next) => {
  // Idempotent per contract: always 204, even with no active session -
  // logout is "make sure I'm logged out," not a query that can fail.
  if (!req.isAuthenticated()) {
    res.status(204).end()
    return
  }
  req.logout((err) => {
    if (err) {
      next(err)
      return
    }
    // req.logout() only clears req.user/the login state on the existing
    // session object - req.session.destroy() is the actual server-side
    // session kill (spec req #8), dropping the row from the connect-pg-simple
    // store, not just unsetting passport's piece of it.
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        next(destroyErr)
        return
      }
      res.clearCookie("clackforge.sid")
      res.status(204).end()
    })
  })
})

// Always 200. "Nobody is signed in" is a normal answer, and returning 401
// would put a red failed-request line in the console on every anonymous visit.
authRouter.get("/api/auth/me", (req, res) => {
  const user = req.isAuthenticated() ? toAuthUser(req.user) : null
  res.status(200).json(SessionResponseSchema.parse({ user }))
})

authRouter.get("/api/auth/google", (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    // Fail gracefully, not a crash: the "google" strategy was never
    // registered (see src/config/passport.ts), so calling
    // passport.authenticate("google", ...) would throw synchronously
    // ("Unknown authentication strategy"). Redirect with the same error
    // contract the callback route uses on a real OAuth failure.
    logger.warn("google_auth_attempted_without_config", { path: req.path })
    res.redirect(`${env.CLIENT_ORIGIN}/login?authError=GOOGLE_AUTH_FAILED`)
    return
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next)
})

authRouter.get("/api/auth/google/callback", (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    res.redirect(`${env.CLIENT_ORIGIN}/login?authError=GOOGLE_AUTH_FAILED`)
    return
  }
  passport.authenticate("google", (err: unknown, user: PrismaUser | false) => {
    if (err || !user) {
      logger.warn("google_auth_failed", { message: err instanceof Error ? err.message : err })
      res.redirect(`${env.CLIENT_ORIGIN}/login?authError=GOOGLE_AUTH_FAILED`)
      return
    }
    req.login(user, (loginErr) => {
      if (loginErr) {
        logger.warn("google_auth_session_failed", { message: loginErr.message })
        res.redirect(`${env.CLIENT_ORIGIN}/login?authError=GOOGLE_AUTH_FAILED`)
        return
      }
      res.redirect(`${env.CLIENT_ORIGIN}/account`)
    })
  })(req, res, next)
})

// "Try as admin" logs the caller into the seeded admin row, the same one a normal
// login would use. The demo is sandboxed by soft-deletes and the reset endpoint,
// so there is no second admin system. Rate limited so one visitor cannot loop
// try-as-admin and reset-demo-data to wipe other reviewers' sessions.
authRouter.post("/api/auth/try-as-admin", demoAdminLimiter, async (req, res, next) => {
  try {
    const admin = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } })
    if (!admin) {
      // Would mean the DB was never seeded - a real ops problem, not a user
      // mistake. Logged loudly so it isn't a silent 500 with no trace.
      logger.error("demo_admin_missing", { email: DEMO_ADMIN_EMAIL })
      res
        .status(500)
        .json(
          ApiErrorSchema.parse({
            error: { message: "Demo admin account is unavailable right now.", code: "DEMO_ADMIN_UNAVAILABLE" },
          }),
        )
      return
    }

    // Exact same session-establishment pattern as register/login/Google
    // callback above - no second login mechanism invented for this route.
    req.login(admin, (err) => {
      if (err) {
        next(err)
        return
      }
      res.status(200).json(AuthResponseSchema.parse({ user: toAuthUser(admin) }))
    })
  } catch (err) {
    next(err)
  }
})
