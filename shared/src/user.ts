import { z } from "zod"
import { IdSchema, IsoDateTimeSchema } from "./common"

export const UserRoleSchema = z.enum(["customer", "admin"])
export type UserRole = z.infer<typeof UserRoleSchema>

/**
 * Public-safe wire shape - mirrors the client's `AuthUser` type plus an
 * additive `role` field. Non-breaking addition (new optional-free field,
 * existing consumers that only read id/email/displayName are unaffected)
 * needed so the client can gate admin nav/routes without a second
 * round-trip.
 */
export const AuthUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  displayName: z.string().min(1),
  role: UserRoleSchema,
})
export type AuthUser = z.infer<typeof AuthUserSchema>

/**
 * Registration payload.
 *
 * `displayName` is OPTIONAL on the wire (most signup forms don't force a
 * name field) but `User.displayName` in `schema.prisma` is NOT nullable -
 * the register handler must derive a fallback when omitted (recommended:
 * the email's local-part before `@`, e.g. `"nich"` from `"nich@example.com"`)
 * before inserting. Document whichever fallback is actually implemented so
 * the UI copy can match it (e.g. a hint like "defaults to your email name
 * if left blank").
 *
 * Password policy is min-length only (8 chars) - hashed passwords are the
 * requirement, not a complexity rule, so no uppercase/number/symbol
 * requirement is enforced here. Don't add one without an explicit ask; it'd
 * be unrequested scope on a locked contract.
 *
 * `displayName` folds `""` into `undefined` via `.transform()` before the
 * length check: an HTML `<input>` left untouched submits `""`, never
 * `undefined`, so a bare `.optional()` still rejects the single most common
 * case (every signup form that doesn't force a name field). In practice, a
 * real browser click-through hit "String must contain at least 1
 * character(s)" on first load, with no way to submit the form at all.
 * `.transform()` (not `.preprocess()`) deliberately keeps the field's input
 * type as `string | undefined` instead of widening it to `unknown` - React
 * Hook Form's `zodResolver` needs input and output types to match here.
 */
export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "password must be at least 8 characters"),
  displayName: z
    .string()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .refine((value) => value === undefined || value.length >= 1, {
      message: "String must contain at least 1 character(s)",
    }),
})
export type RegisterInput = z.infer<typeof RegisterInputSchema>

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof LoginInputSchema>

/**
 * Full DB-shape `User` row - server-internal only, NEVER sent to the client
 * as-is (`hashedPassword` would leak). Map to `AuthUserSchema` at the API boundary.
 */
export const UserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  hashedPassword: z.string().nullable(),
  googleId: z.string().nullable(),
  displayName: z.string().min(1),
  role: UserRoleSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
})
export type User = z.infer<typeof UserSchema>

/**
 * Error codes for every `/api/auth/*` route. These are the values the route
 * handlers put in `ApiErrorSchema`'s `error.code` field (that field stays a
 * generic `z.string()` since other routes have their own codes - e.g.
 * products' `NOT_FOUND`/`BAD_REQUEST` - this enum just documents the
 * auth-specific subset so the client can switch on an exact string and
 * render real per-field error states, not a generic "something went wrong").
 *
 * - `EMAIL_TAKEN` - register: email already belongs to another account
 *   (local or Google-linked). 409 Conflict.
 * - `INVALID_CREDENTIALS` - login: email/password didn't match. Deliberately
 *   ONE code for both "no account with that email" and "wrong password" -
 *   a split would let an attacker enumerate registered emails. 401.
 * - `UNAUTHORIZED` - any session-gated route (`GET /api/auth/me`, and every
 *   other protected resource) hit with no/expired/invalid session. 401.
 * - `GOOGLE_AUTH_FAILED` - `GET /api/auth/google/callback`: Google returned
 *   an error, denied consent, or the strategy otherwise couldn't produce a
 *   session. Not a JSON error - see shared/README.md's redirect contract;
 *   this code is the `?authError=` query value on the failure redirect.
 * - `DEMO_ADMIN_UNAVAILABLE` - `POST /api/auth/try-as-admin`: the seeded
 *   demo admin row (`server/src/config/demoAdmin.ts`'s
 *   `DEMO_ADMIN_EMAIL`) is missing from the DB. Shouldn't happen against a
 *   properly-seeded database - a real ops problem (logged loudly
 *   server-side), not a user-facing input error. 500.
 * - `RATE_LIMITED` - `POST /api/auth/try-as-admin`: more than 10
 *   requests/minute from the same IP (dependency-free in-memory counter
 *   scoped to this one route, see `routes/auth.ts`). 429.
 *
 * Body-shape validation failures (bad email format, password too short) are
 * NOT part of this enum - they fall through to the existing global
 * `VALIDATION_ERROR` code in `server/src/middleware/errorHandler.ts`
 * (thrown by `RegisterInputSchema`/`LoginInputSchema`.parse, same as every
 * other route's Zod validation). Don't invent a second validation code here.
 */
export const AuthErrorCodeSchema = z.enum([
  "EMAIL_TAKEN",
  "INVALID_CREDENTIALS",
  "UNAUTHORIZED",
  "GOOGLE_AUTH_FAILED",
  "DEMO_ADMIN_UNAVAILABLE",
  "RATE_LIMITED",
])
export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>
