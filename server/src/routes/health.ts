import { HealthResponseSchema } from "@shared"
import { Router } from "express"

/**
 * Deliberately mounted before the session middleware in src/app.ts: a
 * liveness check should not depend on the session store (or the DB at all).
 * It never touches Postgres, so it stays truthful even if the DB is down -
 * and it's safe to exercise in CI without a live database.
 */
export const healthRouter = Router()

healthRouter.get("/health", (_req, res) => {
  res.json(HealthResponseSchema.parse({ status: "ok", timestamp: new Date().toISOString() }))
})
