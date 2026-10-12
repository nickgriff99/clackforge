import { ApiErrorSchema } from "@shared"
import type { NextFunction, Request, Response } from "express"
import type { ZodIssue } from "zod"
import { logger } from "../lib/logger"

/** Mounted after every real route - anything that falls through is a true 404. */
export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .json(ApiErrorSchema.parse({ error: { message: `No route for ${req.method} ${req.path}`, code: "ROUTE_NOT_FOUND" } }))
}

/**
 * `@shared` resolves to raw `shared/src/*.ts` (path-alias import, no
 * workspace, no build step). `shared/` carries its own `node_modules/zod`,
 * a separate physical install from `server/node_modules/zod`, so a
 * `ZodError` thrown while parsing a `@shared` schema (e.g.
 * `ProductsQuerySchema.parse(req.query)`) is an instance of a *different*
 * `ZodError` class than `server`'s own `import { ZodError } from "zod"`
 * would give - `instanceof` across that boundary silently returns false
 * even though both are the same zod version, which would otherwise send a
 * validation error to the generic 500 branch instead of 400. Duck-typing
 * on shape instead of class identity works regardless of which physical
 * zod module threw it. The real fix is a single shared zod install (a
 * workspace or hoisted root node_modules); any other cross-boundary
 * `instanceof` check against a `@shared`-thrown error hits the same trap
 * until that happens.
 */
function isZodError(err: unknown): err is { issues: ZodIssue[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  )
}

/**
 * Express only recognizes an error-handling middleware by its arity (4
 * params) - `_next` must stay even though it's unused, or this silently
 * becomes a normal middleware that Express never calls on `next(err)`.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (isZodError(err)) {
    logger.warn("validation_error", { path: req.path, issues: err.issues })
    res.status(400).json(ApiErrorSchema.parse({ error: { message: "Invalid request", code: "VALIDATION_ERROR" } }))
    return
  }

  logger.error("unhandled_error", {
    path: req.path,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })

  res.status(500).json(ApiErrorSchema.parse({ error: { message: "Internal server error", code: "INTERNAL_ERROR" } }))
}
