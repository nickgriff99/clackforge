import Stripe from "stripe"
import { env } from "../config/env"
import { logger } from "./logger"

let client: Stripe | null = null

/**
 * Call once at boot (see src/app.ts's `createApp()`, same spot as the
 * Google OAuth check) - logs a single warning if a real Stripe test-mode
 * secret key hasn't been supplied yet. The server must boot cleanly either
 * way; checkout/webhook routes fail closed per-request instead of crashing
 * (see routes/checkout.ts, routes/webhooks.ts).
 */
export function warnIfStripeNotConfigured(): void {
  if (!env.STRIPE_SECRET_KEY) {
    logger.warn("stripe_not_configured", {
      message:
        "STRIPE_SECRET_KEY is unset: POST /api/checkout/session will fail closed with 500 INTERNAL_ERROR and the webhook route will 503 until the owner supplies real Stripe test-mode keys",
    })
  }
}

/**
 * Lazily constructs (and caches) the Stripe client. Returns null - never
 * throws - when STRIPE_SECRET_KEY is unset, so callers can fail closed per
 * request instead of crashing the process. Stripe's Node SDK is inherently
 * test-mode as long as the provided secret key is a test key (`sk_test_...`)
 * - there is no separate mode flag to set here.
 */
export function getStripeClient(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY)
  return client
}
