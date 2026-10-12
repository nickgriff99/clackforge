import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  // Mirrors the "@shared" path alias in tsconfig.json - vitest runs on Vite,
  // which doesn't read tsconfig `paths` on its own.
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    // Dummy values so src/config/env.ts (which parses process.env at import
    // time and requires DATABASE_URL/SESSION_SECRET) doesn't throw in CI -
    // no real DB is needed because the only route under test (GET /health)
    // is deliberately DB/session-free. Don't reuse these outside tests.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/clackforge_test",
      SESSION_SECRET: "vitest-dummy-session-secret-value",
      CLIENT_ORIGIN: "http://localhost:5173",
    },
  },
})

