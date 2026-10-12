import { useMutation } from "@tanstack/react-query"
import { ApiRequestError, createCheckoutSessionRequest } from "@/lib/api"

/**
 * `POST /api/checkout/session` -> a Stripe-hosted Checkout redirect URL
 * (test mode). The only success action is a full-page redirect
 * (`window.location.href = url`) - never render a custom payment form
 * against this contract; this app only builds Stripe Checkout Sessions,
 * not the Payment Element path.
 *
 * Will currently fail with 500 `INTERNAL_ERROR` ("Stripe is not
 * configured") until real Stripe test-mode keys are supplied - an
 * expected, documented gap, not a bug in this mutation. `Checkout.tsx` is
 * responsible for rendering that (and 400 `EMPTY_CART`/409
 * `OUT_OF_STOCK`) as a graceful message, not a raw error dump.
 */
export function useCreateCheckoutSessionMutation() {
  return useMutation({
    mutationFn: createCheckoutSessionRequest,
    onSuccess: (data) => {
      window.location.href = data.url
    },
  })
}

/** Readable copy per known failure code - anything else falls back to a generic "temporarily unavailable" message. */
export function checkoutErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "EMPTY_CART") return "Your cart is empty. Add something before checking out."
    if (err.code === "OUT_OF_STOCK") return err.message
  }
  return "Checkout is temporarily unavailable. Please try again shortly."
}
