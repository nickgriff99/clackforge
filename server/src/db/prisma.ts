import { PrismaClient } from "@prisma/client"

/**
 * Single PrismaClient instance for the whole process, shared via ES module
 * caching. (Next.js-style global-caching-against-HMR isn't needed here:
 * `tsx watch` restarts the whole process on change, it doesn't hot-reload
 * modules in place, so there's no risk of accumulating duplicate clients.)
 */
export const prisma = new PrismaClient()
