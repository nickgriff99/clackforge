import { ApiErrorSchema } from "@shared"
import type { RequestHandler } from "express"

/**
 * RBAC guard. Composes AFTER `requireAuth` in the route chain (e.g.
 * `router.patch(path, requireAuth, requireAdmin, handler)`) - this
 * middleware does not itself check `req.isAuthenticated()`, it only checks
 * the role on whatever `req.user` `requireAuth` already established.
 * Calling this without `requireAuth` first would read `req.user` as
 * `undefined` on a guest request and 403 (not crash) - still fails closed,
 * but always pair the two in that order so an unauthenticated admin route
 * attempt returns the correct 401 UNAUTHORIZED, not a 403 FORBIDDEN.
 *
 * Reuses `User.role`/`UserRole` (schema.prisma, already backing
 * `AuthUser.role` in shared/src/user.ts) - no new column needed.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    res.status(403).json(ApiErrorSchema.parse({ error: { message: "Admin access required", code: "FORBIDDEN" } }))
    return
  }
  next()
}
