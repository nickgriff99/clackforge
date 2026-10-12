import path from "node:path"
import { configDefaults, defineConfig } from "vitest/config"

// Mirrors tsconfig.app.json's path aliases: vitest runs on Vite, which
// does not read tsconfig `paths` on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // `tests/e2e/**` are Playwright specs. They import `test`/`expect` from
    // `@playwright/test`, which collides with Vitest's runner, so run them
    // with `npm run test:e2e` instead.
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
})
