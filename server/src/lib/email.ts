import { Resend } from "resend"
import { env } from "../config/env"
import { logger } from "./logger"

let client: Resend | null = null

/**
 * Call once at boot (see src/app.ts's `createApp()`) - logs a single warning
 * if RESEND_API_KEY is unset. The dev fallback below is NOT a silent no-op:
 * every email that would have been sent is still fully rendered and logged
 * at `info` level (subject + body), clearly labeled, so nothing is lost and
 * the behavior is visible in the console/logs.
 */
export function warnIfResendNotConfigured(): void {
  if (!env.RESEND_API_KEY) {
    logger.warn("resend_not_configured", {
      message: "RESEND_API_KEY is unset: order confirmation emails will log to console instead of sending (dev fallback)",
    })
  }
}

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  if (!client) client = new Resend(env.RESEND_API_KEY)
  return client
}

export interface OrderConfirmationEmailLine {
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface OrderConfirmationEmailInput {
  to: string
  displayName: string
  orderNumber: string
  total: number
  currency: string
  items: OrderConfirmationEmailLine[]
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
}

function renderEmailBody(input: OrderConfirmationEmailInput): string {
  const lines = input.items
    .map((i) => `  ${i.quantity} x ${i.name}: ${formatCents(i.lineTotal, input.currency)}`)
    .join("\n")
  return [
    `Hi ${input.displayName},`,
    "",
    `Thanks for your CLACKFORGE order ${input.orderNumber}!`,
    "",
    lines,
    "",
    `Total: ${formatCents(input.total, input.currency)}`,
    "",
    "Portfolio demo: no real products are sold. This was a Stripe test-mode transaction.",
  ].join("\n")
}

/**
 * Sends the order confirmation email via Resend, or - if RESEND_API_KEY is
 * unset - logs the full subject+body to the console instead (dev fallback,
 * see `warnIfResendNotConfigured`'s doc comment). Called by the webhook
 * handler AFTER it acks 200 to Stripe (see routes/webhooks.ts step 5 in the
 * contract) - a slow or failed send here must never risk Stripe's webhook
 * timeout/retry, so callers should fire this without awaiting it on the
 * response path and only log a failure, never crash the process.
 *
 * `from` uses Resend's shared sandbox sender (`onboarding@resend.dev`), which
 * works with zero domain setup - fine for a portfolio demo. A real deployment
 * would verify a custom sending domain in the Resend dashboard and use that
 * address instead.
 */
export async function sendOrderConfirmationEmail(input: OrderConfirmationEmailInput): Promise<void> {
  const subject = `Your CLACKFORGE order ${input.orderNumber} is confirmed`
  const body = renderEmailBody(input)

  const resend = getResendClient()
  if (!resend) {
    logger.info("order_confirmation_email_dev_fallback", { to: input.to, subject, body })
    return
  }

  await resend.emails.send({
    from: "CLACKFORGE <onboarding@resend.dev>",
    to: input.to,
    subject,
    text: body,
  })
}
