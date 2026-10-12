import { ApiErrorSchema } from "@shared"
import type { RequestHandler } from "express"
import { rateLimit } from "express-rate-limit"
import helmet from "helmet"
import { env } from "../config/env"
import { logger } from "../lib/logger"

const isProduction = env.NODE_ENV === "production"
const isTest = env.NODE_ENV === "test"

/** Standard secure response headers. CORP is relaxed so share-card images can be embedded cross-origin. */
export const securityHeaders: RequestHandler = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
})

const ALLOWED_ORIGIN = env.CLIENT_ORIGIN.replace(/\/$/, "")
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * CSRF defense for the cookie session. In production the session cookie is
 * `SameSite=None` (client and API live on different origins), so the browser
 * attaches it to cross-site requests. Browsers always send an `Origin` header
 * on cross-site state-changing requests, so rejecting any mutating request
 * whose `Origin` is not the configured client closes that hole. Requests with
 * no `Origin` (curl, server-to-server, tests) carry no ambient browser
 * credentials and are allowed through.
 */
export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }
  const origin = req.get("origin")
  if (origin && origin !== ALLOWED_ORIGIN) {
    logger.warn("csrf_origin_rejected", { origin, path: req.path })
    res
      .status(403)
      .json(ApiErrorSchema.parse({ error: { message: "Request origin not allowed", code: "ORIGIN_NOT_ALLOWED" } }))
    return
  }
  next()
}

function limiter(options: { windowMs: number; limit: number; message: string; code: string }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => isTest,
    handler: (_req, res) => {
      res.status(429).json(ApiErrorSchema.parse({ error: { message: options.message, code: options.code } }))
    },
  })
}

/** Login and register: slows credential stuffing. Loose outside production so local E2E runs are not throttled. */
export const authLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: isProduction ? 30 : 1000,
  message: "Too many attempts. Try again in a few minutes.",
  code: "RATE_LIMITED",
})

/** "Try as admin" + data reset: stops one visitor from wiping other reviewers' demo state in a loop. */
export const demoAdminLimiter = limiter({
  windowMs: 60_000,
  limit: 10,
  message: "Too many requests. Try again in a minute.",
  code: "RATE_LIMITED",
})

/** Blanket cap for the whole API. */
export const apiLimiter = limiter({
  windowMs: 60_000,
  limit: isProduction ? 300 : 5000,
  message: "Too many requests. Slow down.",
  code: "RATE_LIMITED",
})
