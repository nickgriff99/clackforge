/**
 * Single source of truth for the seeded demo admin's email, shared by
 * `routes/auth.ts`'s `POST /api/auth/try-as-admin` (recruiter "Try as
 * admin" mode) and `prisma/seed.ts` (which upserts this exact row) so the
 * two can never drift apart.
 *
 * The password intentionally isn't here - it stays `prisma/seed.ts`-local
 * (`ADMIN_PASSWORD`), since nothing outside the seed script needs it:
 * try-as-admin logs the recruiter in via `req.login()` directly (the same
 * session mechanism as a real login), never by re-submitting a password
 * through the login route.
 */
export const DEMO_ADMIN_EMAIL = "admin@clackforge.test"
