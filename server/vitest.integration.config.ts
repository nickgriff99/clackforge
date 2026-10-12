import path from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Real-Postgres integration suite (the row-lock/oversell race test in
 * `drops.test.ts`). A separate config from vitest.config.ts on purpose: that
 * file's dummy DATABASE_URL keeps `health.test.ts` runnable in CI without
 * Postgres. `setupFiles` below loads the real local server/.env instead.
 *
 * Run with `npm run test:integration` against a development database. It
 * creates and deletes real rows, so never point it at production.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // Same default-ish glob as vitest.config.ts (which sets no override) -
    // matches `drops.test.ts` per the round brief's exact filename. This
    // also re-collects health.test.ts, which is harmless (it's DB-free by
    // design, see that file's own doc comment) - the file-level
    // self-skip guard (see drops.test.ts's top-of-file comment) is what
    // actually keeps the two configs from double-RUNNING the same
    // integration assertions, not this include pattern.
    include: ["src/**/*.test.ts"],
    setupFiles: [path.resolve(import.meta.dirname, "src/test/integration.setup.ts")],
    // A single shared Postgres connection/transaction-per-test suite isn't
    // worth parallelizing for one test file - keeps the race test's own
    // intentional concurrency (5 simultaneous reserve calls against ONE
    // drop) the only concurrency in play, not also racing against another
    // test file's fixture setup/teardown on the same DB.
    fileParallelism: false,
    env: {
      // drops.test.ts's own self-skip guard (see that file's top-of-file
      // comment) - this is the ONLY place this flag is set to "1", so the
      // suite only actually runs under THIS config, never under the default
      // vitest.config.ts's `npm test`, even though both configs' glob
      // patterns technically match the same file on disk.
      CLACKFORGE_RUN_DROP_INTEGRATION: "1",
    },
  },
})
