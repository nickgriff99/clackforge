import type { User as PrismaUser } from "@prisma/client"

/**
 * Passport's own types (`@types/passport`) declare `Express.User` as an empty
 * interface for consumers to augment - this is that augmentation. Merging in
 * the full Prisma `User` row (hashedPassword included) means `req.user` is
 * typed correctly everywhere Passport sets it (`req.login`, strategy `done`
 * callbacks, `deserializeUser`) without a cast at every call site.
 *
 * Safe to carry `hashedPassword` on the type: `req.user` is never serialized
 * directly to a response anywhere in this codebase - every route maps it
 * through `toAuthUser()` (see src/routes/auth.ts) before it touches
 * `AuthResponseSchema`, which is the actual leak boundary (Zod would reject
 * an extra `hashedPassword` field key on a strict object only if the schema
 * were strict; `AuthUserSchema` simply doesn't have the field, so it's never
 * picked up either way).
 */
declare global {
  namespace Express {
    interface User extends PrismaUser {}
  }
}

export {}
