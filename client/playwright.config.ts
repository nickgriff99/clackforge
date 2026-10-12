import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright config for the E2E and accessibility suites in `tests/e2e`.
 *
 * `webServer` starts the Vite dev server. axe and the user-flow tests only
 * need rendered DOM and ARIA semantics, which match production for this
 * client-rendered SPA. `reuseExistingServer` lets you keep `npm run dev` open
 * in another terminal without it being relaunched or torn down.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
