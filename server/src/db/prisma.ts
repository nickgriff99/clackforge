import { PrismaClient } from "@prisma/client"

/**
 * Supabase's Session pooler hands out at most 15 client connections TOTAL
 * (shared by dev, prod and any overlapping deploy). Prisma's default pool is
 * `2 * CPU cores + 1` (41 on a 20-core machine), which exhausts that budget
 * and surfaces as `EMAXCONNSESSION` 500s. Cap it unless the URL already sets
 * its own `connection_limit`.
 */
const PRISMA_CONNECTION_LIMIT = 4

function withPoolLimit(url: string): string {
  if (!url || url.includes("connection_limit=")) return url
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${PRISMA_CONNECTION_LIMIT}`
}

/**
 * Single PrismaClient instance for the whole process, shared via ES module
 * caching. (Next.js-style global-caching-against-HMR isn't needed here:
 * `tsx watch` restarts the whole process on change, it doesn't hot-reload
 * modules in place, so there's no risk of accumulating duplicate clients.)
 */
const databaseUrl = process.env.DATABASE_URL

export const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: withPoolLimit(databaseUrl) } } } : undefined,
)
