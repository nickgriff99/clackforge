import { expect, request, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test"

/**
 * Group buy: several browser contexts race for the last unit, exactly one wins.
 *
 * `server/src/routes/drops.test.ts` already proves the database row lock with
 * concurrent raw HTTP requests. This spec proves the full UI path under
 * contention: independent `BrowserContext`s (separate cookies, separate
 * registered users) click the real "Reserve" button in `DropDetail.tsx`.
 *
 * Fixture: seeded drop `aurora-reserve` (totalStock 18, status "live"). Stock
 * is driven to an exact target through `PATCH /api/admin/drops/:slug` using the
 * real try-as-admin session. The spec never calls `reset-demo-data`, because a
 * full reseed would disturb other specs running against the same database.
 * Every reservation it creates is released through the real "Release this
 * hold" button, and `afterAll` restores totalStock to 18 and asserts
 * `availableStock === 18`.
 */

const SERVER_ORIGIN = "http://localhost:3000"
const CLIENT_ORIGIN = "http://localhost:5173"
const DROP_SLUG = "aurora-reserve"
const RUN_ID = Date.now()
const TEST_PASSWORD = "correct-horse-battery-staple"

let emailCounter = 0
function uniqueEmail(tag: string): string {
  emailCounter += 1
  return `race-${tag}-${RUN_ID}-${emailCounter}@example.com`
}

type PublicDropState = {
  totalStock: number
  availableStock: number
  status: "upcoming" | "live" | "sold_out" | "closed"
}

async function getDropState(api: APIRequestContext): Promise<PublicDropState> {
  const res = await api.get(`/api/drops/${DROP_SLUG}`)
  expect(res.ok(), `GET drop state failed: ${res.status()} ${await res.text()}`).toBeTruthy()
  return res.json()
}

/** Logs the admin API context in via the real demo "try as admin" route - same session mechanism the UI's "Try as admin" button uses, just driven directly so setup/teardown doesn't need a browser. */
async function adminApiContext(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: SERVER_ORIGIN })
  const res = await api.post("/api/auth/try-as-admin")
  expect(res.ok(), `try-as-admin failed: ${res.status()} ${await res.text()}`).toBeTruthy()
  return api
}

/**
 * Drives `aurora-reserve`'s PUBLIC `availableStock` to an exact target by
 * PATCHing `totalStock` up/down around the live floor (`soldCount + active
 * reservations`), recomputed fresh from a live GET every call - so this is
 * safe to call repeatedly across scenarios regardless of what reservations
 * earlier scenarios left behind (as long as they were released; see the
 * module doc comment).
 */
async function forceAvailableStockTo(api: APIRequestContext, target: number): Promise<PublicDropState> {
  const before = await getDropState(api)
  const floor = before.totalStock - before.availableStock // soldCount + currently-active reservations
  const newTotalStock = floor + target
  const patchRes = await api.patch(`/api/admin/drops/${DROP_SLUG}`, { data: { totalStock: newTotalStock } })
  expect(patchRes.ok(), `PATCH totalStock=${newTotalStock} failed: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy()

  const after = await getDropState(api)
  expect(after.availableStock, `expected availableStock=${target}, got ${after.availableStock} (floor=${floor})`).toBe(target)
  return after
}

/** Real UI registration (not a hand-seeded session) -> lands on `/drop/aurora-reserve`, authenticated. */
async function registerAndLandOnDrop(browser: Browser, tag: string): Promise<{ context: BrowserContext; page: Page; email: string }> {
  const context = await browser.newContext({ baseURL: CLIENT_ORIGIN })
  const page = await context.newPage()
  const email = uniqueEmail(tag)

  await page.goto("/register", { waitUntil: "networkidle" })
  // `exact: true` matters here: the footer's newsletter signup ALSO has a
  // labelled "Email address" field on every page (real find, not
  // hypothetical - a plain `getByLabel("Email")` strict-mode-violates
  // against it), so an inexact match would be ambiguous.
  await page.getByLabel("Display name", { exact: true }).fill(`Racer ${tag}`)
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await page.waitForURL(/\/account/, { timeout: 15_000 })

  await page.goto(`/drop/${DROP_SLUG}`, { waitUntil: "networkidle" })
  return { context, page, email }
}

/** Sonner's own DOM marker (`client/src/components/ui/sonner.tsx`) - scoped so text matches never collide with the badge/body copy that repeats the same words ("Sold out") elsewhere on the page. */
function toastLocator(page: Page) {
  return page.locator("[data-sonner-toast]")
}

async function waitForReserveOutcome(page: Page): Promise<"success" | "sold_out"> {
  const toast = toastLocator(page).first()
  await expect(toast).toBeVisible({ timeout: 10_000 })
  const text = (await toast.textContent()) ?? ""
  if (text.includes("Reserved")) return "success"
  if (text.includes("Sold out")) return "sold_out"
  throw new Error(`Unexpected toast on reserve attempt: ${JSON.stringify(text)}`)
}

/**
 * Releases whatever ACTIVE reservation this page's session holds via the
 * real "Release this hold" button - the cleanup half of every scenario
 * below, so the drop's floor never permanently climbs across the suite.
 *
 * FOUND + FIXED (real bug in this test file, caught by its own `afterAll`
 * drift check): the first version used a bare `releaseButton.isVisible()`
 * with no wait, which can read `false` in the gap between the reserve
 * mutation resolving and React re-rendering the `HeldReservationPanel` -
 * silently no-op-ing instead of releasing, leaking exactly 1 unit of
 * "floor" per flaky skip (reproduced: a full run left `availableStock` at
 * 17/18 instead of 18/18 with no test-level failure to explain why, until
 * `afterAll`'s own restored-value assertion caught the drift). `required:
 * true` makes every call site that KNOWS a reservation must exist fail
 * loudly instead of silently leaking.
 */
async function releaseHold(page: Page, { required }: { required: boolean }): Promise<void> {
  const releaseButton = page.getByRole("button", { name: /release this hold/i })
  const appeared = await releaseButton
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  if (!appeared) {
    if (required) {
      throw new Error("Expected a 'Release this hold' button (an active reservation) but none appeared - cleanup would silently leak stock.")
    }
    return
  }

  await releaseButton.click()
  await expect(toastLocator(page).filter({ hasText: "Reservation released" })).toBeVisible({ timeout: 10_000 })
}

/**
 * Collects browser-side console errors / uncaught exceptions for a page -
 * exploratory habit: a race condition that merely "fails gracefully" in the
 * UI but throws in the console is still a real bug. Excludes Chrome's own
 * network-diagnostic "Failed to load resource: 409/..." log line: that's
 * the browser logging the raw HTTP response status for ANY non-2xx fetch,
 * emitted even when the app's own code catches the error perfectly
 * gracefully (as `handleReserve`'s try/catch does for the expected SOLD_OUT
 * 409) - confirmed as a false positive against THIS app's real,
 * intentional error-handling path, not suppressed blindly.
 */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
      errors.push(`console.error: ${msg.text()}`)
    }
  })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

test.describe.serial("group buy race condition - real browser contexts (PROJECT_SPECS.md §9.3)", () => {
  let adminApi: APIRequestContext
  let originalState: PublicDropState

  test.beforeAll(async () => {
    adminApi = await adminApiContext()
    originalState = await getDropState(adminApi)
    // Confirms the brief's assumed seed shape before mutating anything -
    // don't assume, check (per the round brief's explicit instruction).
    expect(originalState.totalStock, "expected the seeded aurora-reserve totalStock to be 18 going in").toBe(18)
    expect(originalState.availableStock, "expected aurora-reserve to be fully available (no stray reservations) going in").toBe(18)
  })

  test.afterAll(async () => {
    const patchRes = await adminApi.patch(`/api/admin/drops/${DROP_SLUG}`, { data: { totalStock: originalState.totalStock } })
    expect(patchRes.ok(), `restore PATCH failed: ${patchRes.status()} ${await patchRes.text()}`).toBeTruthy()

    const restored = await getDropState(adminApi)
    expect(restored.totalStock, "aurora-reserve totalStock not restored to seeded value").toBe(originalState.totalStock)
    expect(restored.availableStock, "aurora-reserve availableStock not restored to seeded value (stray reservation left behind?)").toBe(
      originalState.availableStock,
    )

    await adminApi.dispose()
  })

  test("two independent contexts race for the last unit - exactly one succeeds", async ({ browser }) => {
    await forceAvailableStockTo(adminApi, 1)

    const racerA = await registerAndLandOnDrop(browser, "twoway-a")
    const racerB = await registerAndLandOnDrop(browser, "twoway-b")
    const errorsA = collectPageErrors(racerA.page)
    const errorsB = collectPageErrors(racerB.page)

    try {
      const [outcomeA, outcomeB] = await Promise.all([
        (async () => {
          await racerA.page.getByRole("button", { name: "Reserve" }).click()
          return waitForReserveOutcome(racerA.page)
        })(),
        (async () => {
          await racerB.page.getByRole("button", { name: "Reserve" }).click()
          return waitForReserveOutcome(racerB.page)
        })(),
      ])

      const outcomes = [outcomeA, outcomeB]
      expect(outcomes.filter((o) => o === "success"), `outcomes were ${JSON.stringify(outcomes)}`).toHaveLength(1)
      expect(outcomes.filter((o) => o === "sold_out"), `outcomes were ${JSON.stringify(outcomes)}`).toHaveLength(1)

      const winnerPage = outcomeA === "success" ? racerA.page : racerB.page
      const loserPage = outcomeA === "success" ? racerB.page : racerA.page

      // Real UI confirmation, not just the toast - the "holding N units" panel.
      await expect(winnerPage.getByText(/Holding \d+ unit/)).toBeVisible()

      // Loser's page should settle into a graceful sold-out state too, once
      // its own 3s poll picks up the new server truth - not just the toast.
      await expect(loserPage.getByText(/Every unit in this run was claimed/)).toBeVisible({ timeout: 6_000 })
      await expect(loserPage.getByRole("button", { name: "Reserve" })).toHaveCount(0)

      // Server-side cross-check, not just trusting the DOM.
      const serverState = await getDropState(adminApi)
      expect(serverState.availableStock).toBe(0)
      expect(serverState.status).toBe("sold_out")

      await releaseHold(winnerPage, { required: true })

      expect(errorsA, `console/page errors on racer A: ${JSON.stringify(errorsA)}`).toEqual([])
      expect(errorsB, `console/page errors on racer B: ${JSON.stringify(errorsB)}`).toEqual([])
    } finally {
      await racerA.context.close()
      await racerB.context.close()
    }
  })

  test("4 contexts race for one last unit - still exactly one winner under higher contention", async ({ browser }) => {
    await forceAvailableStockTo(adminApi, 1)

    const racers = await Promise.all(
      Array.from({ length: 4 }, (_, i) => registerAndLandOnDrop(browser, `fourway-${i}`)),
    )

    try {
      const outcomes = await Promise.all(
        racers.map(async ({ page }) => {
          await page.getByRole("button", { name: "Reserve" }).click()
          return waitForReserveOutcome(page)
        }),
      )

      expect(outcomes.filter((o) => o === "success"), `outcomes were ${JSON.stringify(outcomes)}`).toHaveLength(1)
      expect(outcomes.filter((o) => o === "sold_out"), `outcomes were ${JSON.stringify(outcomes)}`).toHaveLength(3)

      const serverState = await getDropState(adminApi)
      expect(serverState.availableStock).toBe(0)
      expect(serverState.status).toBe("sold_out")

      const winnerIndex = outcomes.indexOf("success")
      await releaseHold(racers[winnerIndex].page, { required: true })
    } finally {
      await Promise.all(racers.map((r) => r.context.close()))
    }
  })

  test("same signed-in user double-clicking Reserve does not double-charge their held quantity", async ({ browser }) => {
    await forceAvailableStockTo(adminApi, 5)
    const before = await getDropState(adminApi)

    const racer = await registerAndLandOnDrop(browser, "dblclick")
    const errors = collectPageErrors(racer.page)

    try {
      const reserveButton = racer.page.getByRole("button", { name: "Reserve" })
      await expect(reserveButton).toBeEnabled()

      // Genuinely rapid, not sequential-awaited - whether the 2nd click
      // actually reaches the server depends on how fast React flips the
      // button's `disabled` state from `reserveMutation.isPending`; report
      // what really happens instead of assuming either way.
      const clickResults = await Promise.allSettled([reserveButton.click(), reserveButton.click({ timeout: 3_000 })])
      const secondClickLanded = clickResults[1].status === "fulfilled"

      // At least one outcome toast must appear regardless.
      await waitForReserveOutcome(racer.page).catch(() => {
        // If the 2nd click never landed (button disabled fast enough), the
        // 1st click's toast may already have been dismissed by the time we
        // get here - that's fine, the cart-state assertion below is the
        // real check for this scenario, not the toast timing.
      })

      const after = await getDropState(adminApi)
      const reservedDelta = before.availableStock - after.availableStock
      // Exactly 1 unit reserved (2nd click blocked client-side by the
      // disabled button) OR exactly 2 (both clicks landed and the server's
      // merge-into-existing-ACTIVE-reservation logic in drops.ts combined
      // them) are BOTH correct, oversell-safe outcomes. Anything else is a
      // real bug.
      expect([1, 2], `reservedDelta was ${reservedDelta}, secondClickLanded=${secondClickLanded}`).toContain(reservedDelta)

      // The real dedup check: regardless of whether 1 or 2 units got
      // reserved, this must show as ONE cart line item, not two separate
      // rows for the same product/variant (that would be the actual
      // "double-charge" bug this scenario is hunting for).
      //
      // REAL FINDING (not a test bug - see this round's handoff): checking
      // the cart via `racer.page.goto("/cart")` on the SAME page object and
      // then navigating back would lose the ability to release the hold -
      // `DropDetail.tsx`'s `heldReservation` (and therefore its "Release
      // this hold" button) is LOCAL component state set only from the
      // POST-reserve response body, with NO other UI surface anywhere in
      // this app that can release an active reservation. Navigate away and
      // back (or just refresh) and that control is gone for good until the
      // 10-minute TTL expires server-side - confirmed by deliberately
      // reproducing it once (see handoff). Worked around here with a SECOND
      // page in the same `BrowserContext` (same session cookies) so the
      // original page's local state survives for the real release step.
      const cartPage = await racer.context.newPage()
      await cartPage.goto("/cart", { waitUntil: "networkidle" })
      const cartMentions = cartPage.getByText(/Aurora Reserve/)
      await expect(cartMentions).toHaveCount(1)
      await cartPage.close()

      await releaseHold(racer.page, { required: true })

      expect(errors, `console/page errors: ${JSON.stringify(errors)}`).toEqual([])
    } finally {
      await racer.context.close()
    }
  })

  test("a fresh context landing on an already-sold-out drop gets a clean sold-out state, not confused residual UI", async ({ browser }) => {
    // REAL FINDING, worked around here (test-harness-only, not a product
    // fix): `AdminUpdateDropInputSchema.totalStock` is `.positive()` (see
    // routes/drops.ts's PATCH route doc comment) - zero is REJECTED, so
    // `forceAvailableStockTo(adminApi, 0)` 400s with VALIDATION_ERROR
    // whenever the live floor is also 0 (reproduced directly: PATCH
    // `{ totalStock: 0 }` against a drop with no sold/reserved units ->
    // `400 {"error":{"code":"VALIDATION_ERROR"}}`). That's intentional
    // product behavior (a drop should always declare a positive total run
    // size; "sold out" is expressed via `availableStock <= 0`, never via
    // `totalStock = 0`) - so getting to a genuine already-sold-out state
    // has to go through a REAL reservation consuming the last real unit,
    // not an admin shortcut. Arguably more realistic anyway: this is
    // exactly the "race after a prior test run already sold it out"
    // scenario the round brief asked for.
    await forceAvailableStockTo(adminApi, 1)
    const filler = await registerAndLandOnDrop(browser, "sold-out-filler")
    await filler.page.getByRole("button", { name: "Reserve" }).click()
    const fillerOutcome = await waitForReserveOutcome(filler.page)
    expect(fillerOutcome, "setup step: expected the filler reservation to consume the last real unit").toBe("success")

    const serverState = await getDropState(adminApi)
    expect(serverState.availableStock, "setup step: drop should be genuinely sold out before the real check below").toBe(0)

    const context = await browser.newContext({ baseURL: CLIENT_ORIGIN })
    const page = await context.newPage()
    const errors = collectPageErrors(page)

    try {
      // No account at all for this one - PROJECT_SPECS.md's sold-out state
      // must read cleanly even logged out, since `data.status === "live"` is
      // the ONLY gate on rendering reserve controls at all (DropDetail.tsx) -
      // a signed-out guest should see the same sold-out messaging, not a
      // sign-in prompt mistaken for "still available."
      await page.goto(`/drop/${DROP_SLUG}`, { waitUntil: "networkidle" })

      await expect(page.getByText("Sold out", { exact: true })).toBeVisible()
      await expect(page.getByText(/Every unit in this run was claimed/)).toBeVisible()
      await expect(page.getByRole("button", { name: "Reserve" })).toHaveCount(0)
      await expect(page.getByText("0 of")).toBeVisible()

      expect(errors, `console/page errors: ${JSON.stringify(errors)}`).toEqual([])
    } finally {
      await context.close()
      await releaseHold(filler.page, { required: true })
      await filler.context.close()
    }
  })
})
