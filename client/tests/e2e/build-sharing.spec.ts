import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"

/**
 * Share a build, open it in a fresh browser context, get the identical config.
 *
 * Covers both share mechanisms:
 *   - the `?b=` URL codec (`features/configurator/urlCodec.ts`): client-side
 *     encode/decode, no auth or database.
 *   - the `/b/:id` named link (`routes/BuildShare.tsx`, `POST /api/builds`):
 *     needs sign-in to create, public to view.
 *
 * Every selection below is compatible under `shared/src/compatibility.ts`, so
 * the UI never refuses a pick and the test stays about share round-trips.
 *
 * Desktop viewport only: `Build.tsx` mounts a desktop panel and a CSS-hidden
 * mobile panel at the same time, so selectors target the visible, unprefixed
 * desktop ids.
 */

const SELECTIONS: Array<{ slot: string; optionId: string }> = [
  { slot: "caseMaterial", optionId: "case-mat-aluminum" },
  { slot: "caseColor", optionId: "case-col-graphite" },
  { slot: "caseFinish", optionId: "case-fin-anodized" },
  { slot: "plate", optionId: "plate-aluminum" },
  { slot: "switches", optionId: "switch-ember-linear" },
  { slot: "keycaps", optionId: "keycap-signal-standard" },
  { slot: "stabilizers", optionId: "stab-tuned" },
  { slot: "cable", optionId: "cable-graphite" },
  { slot: "artisanKeycap", optionId: "artisan-forge-rivet" },
]
const LAYOUT_ID = "65"

/**
 * `OptionStep`/`LayoutStep` each render a visually-hidden native `<input
 * id="...">` (sr-only, zero-size, clip-path-hidden - not a real click/assert
 * target) PLUS a sibling, actually-visible `[role="radio"]` span inside the
 * `<label for="...">` that wraps both. Confirmed live via `page.content()`
 * during this suite's own authoring - the native input is NOT where
 * base-ui's checked state or click handling lives; the role="radio" span is.
 * `label[for="${id}"] [role="radio"]` reaches that span through the one
 * stable id this codebase actually assigns (the auto-generated
 * `base-ui-_r_N_` id on the span itself is NOT stable across renders).
 */
function radioLocator(page: Page, id: string) {
  return page.locator(`label[for="${id}"] [role="radio"]`)
}

/** Configures the desktop panel's layout + every slot above, via real radio clicks. */
async function configureBuild(page: Page) {
  await page.goto("/build", { waitUntil: "networkidle" })
  await radioLocator(page, `layout-${LAYOUT_ID}`).click()
  for (const { slot, optionId } of SELECTIONS) {
    await radioLocator(page, `${slot}-${optionId}`).click()
  }
  // Let the `?b=` sync effect (routes/Build.tsx) catch up before reading the URL.
  const last = SELECTIONS.at(-1)!
  await expect(radioLocator(page, `${last.slot}-${last.optionId}`)).toHaveAttribute("aria-checked", "true")
}

/** Asserts the desktop panel's layout + every slot above are checked exactly as configured. */
async function expectSelectionsApplied(page: Page) {
  await expect(radioLocator(page, `layout-${LAYOUT_ID}`)).toHaveAttribute("aria-checked", "true")
  for (const { slot, optionId } of SELECTIONS) {
    await expect(
      radioLocator(page, `${slot}-${optionId}`),
      `${slot} should have ${optionId} checked`,
    ).toHaveAttribute("aria-checked", "true")
  }
}

/**
 * Reads the "Running total" value - present identically on `/build` and
 * `/b/:id` (both render `Build.tsx`). `span.font-specs.text-xl` is the exact
 * (and, confirmed live, only) element carrying that value on this page -
 * `getByText("Running total")` turned out ambiguous in practice (Playwright
 * resolved it against more than the one visible row), so this targets the
 * value's own class pair directly instead.
 */
async function getRunningTotal(page: Page): Promise<string> {
  const text = await page.locator("span.font-specs.text-xl").innerText()
  const match = text.match(/\$[\d,]+\.\d{2}/)
  if (!match) throw new Error(`Could not find a price in running-total text: "${text}"`)
  return match[0]
}

test.describe("Build sharing - ?b= URL codec (guest, no auth or DB)", () => {
  test("configure a build, open the ?b= URL in a fresh context, selections and price match exactly", async ({
    page,
    browser,
  }) => {
    await configureBuild(page)
    await expectSelectionsApplied(page)
    const originalTotal = await getRunningTotal(page)
    await expect(page.locator("canvas").first()).toBeVisible()

    const shareUrl = page.url()
    expect(shareUrl).toContain("?b=")

    // Genuinely fresh context - no shared localStorage/cookies with `page` above.
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await freshPage.goto(shareUrl, { waitUntil: "networkidle" })

    await expectSelectionsApplied(freshPage)
    const freshTotal = await getRunningTotal(freshPage)
    expect(freshTotal).toBe(originalTotal)
    await expect(freshPage.locator("canvas").first()).toBeVisible()

    await freshContext.close()
  })

  test("a malformed ?b= value falls back gracefully with a toast, does not crash", async ({ page }) => {
    await page.goto("/build?b=%25%25not-valid-base64%25%25", { waitUntil: "networkidle" })
    await expect(
      page.getByText("This build link looks invalid and can't be opened. Showing the default configurator instead."),
    ).toBeVisible()
    // Falls back to the default configurator (DEFAULT_LAYOUT = "tkl", store.ts), not a blank/crashed page.
    await expect(page.getByRole("heading", { name: "Build" })).toBeVisible()
    await expect(radioLocator(page, "layout-tkl")).toHaveAttribute("aria-checked", "true")
  })
})

test.describe("Build sharing - /b/:id DB-backed named link (requires sign-in to create)", () => {
  test("sign in, save a build, share its /b/:id link, open in a fresh context: selections/price match + shared-build banner shows", async ({
    page,
    browser,
  }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])

    // Fresh account per run - register also establishes a session.
    const email = `e2e-share-${randomUUID()}@example.com`
    await page.goto("/register", { waitUntil: "networkidle" })
    // `#email`/`#password` (not `getByLabel`) - the footer's newsletter signup form (rendered on
    // every page via `RootLayout`) has its OWN "Email address" label, which makes `getByLabel
    // ("Email")` ambiguous across the whole page, not just the register form.
    await page.locator("#email").fill(email)
    await page.locator("#password").fill("testpass123")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page.getByText("Account created")).toBeVisible()

    await configureBuild(page)
    const originalTotal = await getRunningTotal(page)

    await page.getByRole("button", { name: "Save build" }).click()
    await page.getByLabel("Build name").fill("Share round-trip check")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("Build saved")).toBeVisible()

    await page.getByRole("button", { name: "Share link" }).click()
    await expect(page.getByText("Link copied")).toBeVisible()
    const shareUrl = await page.evaluate(() => navigator.clipboard.readText())
    expect(shareUrl).toMatch(/\/b\/[^/]+$/)

    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await freshPage.goto(shareUrl, { waitUntil: "networkidle" })

    await expect(
      freshPage.getByText(
        "You're viewing a shared build. The 3D model, spec sheet, and price below are exactly as its owner left them.",
      ),
    ).toBeVisible()
    await expectSelectionsApplied(freshPage)
    const freshTotal = await getRunningTotal(freshPage)
    expect(freshTotal).toBe(originalTotal)

    await freshContext.close()
  })

  test("a nonexistent /b/:id shows the documented clean 404 state, not a crash", async ({ page }) => {
    await page.goto(`/b/${randomUUID()}`, { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { name: "This build isn't here." })).toBeVisible()
    await expect(page.getByText("404")).toBeVisible()
    // `<Button render={<Link .../>}>` (button.tsx) renders an `<a>` with an explicit `role="button"`
    // overriding its implicit link role - this app's own convention, confirmed live - so this is
    // `getByRole("button", ...)`, not `getByRole("link", ...)`.
    await expect(page.getByRole("button", { name: "Start a new build" })).toBeVisible()
  })
})
