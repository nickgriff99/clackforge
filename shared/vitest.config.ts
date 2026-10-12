import { defineConfig } from "vitest/config"

// No "@shared" alias needed here (unlike server/vitest.config.ts) - tests in
// this package import relatively (./cart, ./product, etc.), since this IS
// the package those aliases point at.
export default defineConfig({
  test: {
    environment: "node",
  },
})
