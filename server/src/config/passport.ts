import type { User as PrismaUser } from "@prisma/client"
import { compare } from "bcryptjs"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { Strategy as LocalStrategy } from "passport-local"
import { prisma } from "../db/prisma"
import { logger } from "../lib/logger"
import { env } from "./env"

/**
 * Wires Passport's session plumbing + both strategies. Call once at app
 * boot (see src/app.ts). Idempotent if called more than once (e.g. tests
 * constructing the app repeatedly) - `passport.use` just re-registers a
 * strategy under the same name, last write wins, no duplicate-session bug.
 */
export function configurePassport(): void {
  // Only `user.id` goes into the session row (small, stable, never stale if
  // displayName/role change later) - full user is re-read from the DB on
  // every request via deserializeUser. This is also what makes `req.logIn`
  // + `req.session.destroy()` in the logout route a real server-side
  // session kill, not just a client cookie clear.
  passport.serializeUser((user, done) => {
    done(null, user.id)
  })

  passport.deserializeUser((id: string, done) => {
    void (async () => {
      try {
        const user = await prisma.user.findUnique({ where: { id } })
        // Deleted/missing user with a still-live session cookie: fail closed
        // (`false`), not an error - Passport then treats the request as
        // unauthenticated, which is what `requireAuth`/`/api/auth/me` want.
        done(null, user ?? false)
      } catch (err) {
        done(err, false)
      }
    })()
  })

  passport.use(
    new LocalStrategy({ usernameField: "email", passwordField: "password" }, (email, password, done) => {
      void (async () => {
        try {
          const user = await prisma.user.findUnique({ where: { email } })
          // No account OR a Google-only account with no local password set:
          // same `done(null, false)` outcome either way, so the route layer
          // can't tell the two apart either - this is where the
          // INVALID_CREDENTIALS "one message for both reasons" contract
          // actually gets enforced, not just in the route handler.
          if (!user?.hashedPassword) {
            done(null, false)
            return
          }
          const matches = await compare(password, user.hashedPassword)
          done(null, matches ? user : false)
        } catch (err) {
          done(err)
        }
      })()
    }),
  )

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_CALLBACK_URL) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL,
        },
        (_accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value
          if (!email) {
            // Google account with no verified email on the profile - can't
            // link to our email-keyed User table at all.
            done(null, false)
            return
          }

          void (async () => {
            try {
              const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.id } })
              if (byGoogleId) {
                done(null, byGoogleId)
                return
              }

              // If a local-password account already owns this email,
              // auto-link by setting googleId on that row rather than
              // rejecting. Google has already verified the email belongs to
              // whoever is signing in, and the schema already supports one
              // user row with both auth methods - rejecting here would just
              // force the user into a confusing "pick one" flow for no
              // security benefit.
              const byEmail = await prisma.user.findUnique({ where: { email } })
              const linkedOrCreated: PrismaUser = byEmail
                ? await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: profile.id } })
                : await prisma.user.create({
                    data: {
                      email,
                      googleId: profile.id,
                      displayName: profile.displayName || email.split("@")[0] || email,
                    },
                  })
              done(null, linkedOrCreated)
            } catch (err) {
              done(err as Error)
            }
          })()
        },
      ),
    )
    logger.info("google_oauth_configured")
  } else {
    logger.warn("google_oauth_not_configured", {
      message:
        "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALLBACK_URL not set: /api/auth/google and /api/auth/google/callback will redirect with ?authError=GOOGLE_AUTH_FAILED instead of starting the OAuth flow. Local email/password register/login is unaffected.",
    })
  }
}
