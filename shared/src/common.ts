import { z } from "zod"

/**
 * Money is ALWAYS integer cents across this app - client, API, and DB agree.
 * Never store or transmit a float dollar amount.
 */
export const CentsSchema = z.number().int().min(0)
export type Cents = z.infer<typeof CentsSchema>

/** Stripe-style lowercase ISO 4217 code. Stripe runs in test mode only (see demo banner). */
export const CurrencySchema = z.string().length(3).toLowerCase().default("usd")
export type Currency = z.infer<typeof CurrencySchema>

/** Prisma `cuid()` id - treated as an opaque string on the wire, not format-validated. */
export const IdSchema = z.string().min(1)
export type Id = z.infer<typeof IdSchema>

/** Wire-format timestamp - ISO 8601 string (JSON has no Date type). */
export const IsoDateTimeSchema = z.string().datetime()
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>

/** Standard error envelope every API handler returns on failure. */
export const ApiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
