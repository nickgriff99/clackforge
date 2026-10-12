import path from "node:path"

/**
 * Loaded only by vitest.integration.config.ts, never the default
 * vitest.config.ts (which deliberately stubs DATABASE_URL with a dummy
 * value so health.test.ts runs DB-free in CI - see that config's doc
 * comment). This loads the real server/.env (same file `npm run dev`
 * uses), via Node's native `process.loadEnvFile` - no `dotenv` dependency
 * needed. Throws loudly (not silently falls back) if server/.env is
 * missing - a real-Postgres integration suite is meaningless without it,
 * and a clear ENOENT here is far easier to debug than a cryptic Prisma
 * connection error three layers down once `src/config/env.ts` parses an
 * empty DATABASE_URL.
 */
process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env"))
