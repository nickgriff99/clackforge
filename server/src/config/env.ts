import { z } from "zod"

/**
 * Fail fast, fail clear. Parse process.env once at boot so a missing
 * DATABASE_URL/SESSION_SECRET throws a readable Zod error here instead of a
 * cryptic Prisma/connect-pg-simple stack trace three layers deep the first
 * time a request touches the DB or session store.
 *
 * NOTE: prisma/seed.ts intentionally does NOT import this module - it talks
 * to PrismaClient directly and only needs DATABASE_URL, not the full app
 * config. Don't route narrow entrypoints through this all-required loader.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Required even though no login route writes to the session yet:
  // express-session needs a real secret to sign the session cookie.
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  // Origin of the deployed/dev client, used for the CORS allowlist and to
  // decide the session cookie's SameSite/Secure behavior (see src/app.ts).
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  // Number of reverse proxies in front of Express (for req.ip and req.secure).
  // 1 on a plain Render web service; 2 when a static site proxies /api to it.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  // Google OAuth (Passport). Deliberately optional: a real Google OAuth app
  // is a manual setup step outside this codebase, so local-strategy
  // register/login must keep working with these unset. See
  // src/config/passport.ts - the Google strategy only registers when all
  // three are present; otherwise it logs a warning at boot and the
  // /api/auth/google* routes redirect with GOOGLE_AUTH_FAILED instead of
  // crashing or 500ing.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  // Stripe test mode + Resend. Deliberately optional: no real Stripe/Resend
  // accounts exist yet (manual setup step, out of band). With these unset,
  // the server still boots cleanly; POST /api/checkout/session fails closed
  // with 500 INTERNAL_ERROR, POST /api/webhooks/stripe responds 503, and
  // order confirmation emails log to the console instead of sending - see
  // src/lib/stripe.ts / src/lib/email.ts for the fail-gracefully-per-request
  // guards. Stripe's Node SDK is inherently test-mode as long as
  // STRIPE_SECRET_KEY is a test key (sk_test_...) - no separate mode flag.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
})

export const env = EnvSchema.parse(process.env)
export type Env = z.infer<typeof EnvSchema>
