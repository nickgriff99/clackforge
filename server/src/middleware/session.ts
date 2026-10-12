import connectPgSimple from "connect-pg-simple"
import type { RequestHandler } from "express"
import session from "express-session"
import { env } from "../config/env"

// With `saveUninitialized: false` (deliberate - don't write a session row
// for every anonymous bot hit), express-session never calls `store.set()`
// for a request that doesn't modify `req.session`. Without a login route
// touching it, nothing would ever modify the session and no Set-Cookie
// would ever be issued. The `touchSession` middleware below assigns this
// field once per anonymous visitor to force that first save - which the
// guest cart also needs (`Cart.sessionId` in schema.prisma is keyed off
// `req.sessionID`, so a session must exist before there's anything to log
// in to).
declare module "express-session" {
  interface SessionData {
    initializedAt?: string
  }
}

const PgSession = connectPgSimple(session)

/**
 * `tableName`/`createTableIfMissing: false`: the `session` table is
 * Prisma-migration-owned (see schema.prisma `Session` model, shaped 1:1 to
 * connect-pg-simple's own table.sql). Letting connect-pg-simple create it
 * would fight the Prisma migration history.
 */
export const sessionMiddleware: RequestHandler = session({
  store: new PgSession({
    conString: env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: false,
  }),
  name: "clackforge.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    /**
     * See the longer comment in src/app.ts for why separate origins were
     * chosen over a same-site proxy. Short version: Render's
     * *.onrender.com subdomains are each on the Public Suffix List, so the
     * static site and the web service are different "sites" to the browser
     * even though they share a parent domain. Cross-site cookies require
     * SameSite=None + Secure, which also requires HTTPS - true on Render,
     * not true on plain-HTTP localhost - so this branches on NODE_ENV.
     */
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  },
})

/** Forces a session row + Set-Cookie for first-time (anonymous) visitors. See above. */
export const touchSession: RequestHandler = (req, _res, next) => {
  req.session.initializedAt ??= new Date().toISOString()
  next()
}
