import { expect, test, type Browser, type Locator, type Page } from "@playwright/test"

/**
 * Admin changes stock, the shop reflects it.
 *
 * Fixture: seed product "Foundry TKL", variant "Smoke" (SKU `FDY-TKL-SMK`,
 * seeded stock 12). It is deliberately not `anvil-65` (the configurator's base
 * kit) so parallel specs do not interfere.
 *
 * Two independent browser contexts play "admin in one session, a customer
 * browsing in another". A shared page object would miss a bug where the change
 * only reached the admin's own cache. Each assertion reloads the shop page
 * instead of trusting client state, since cross-session propagation is the
 * thing under test.
 */

const PRODUCT_NAME = "Foundry TKL"
const PRODUCT_SLUG = "foundry-tkl"
const VARIANT_NAME = "Smoke"

async function loginAsAdmin(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/login", { waitUntil: "networkidle" })
  await page.getByLabel("Email", { exact: true }).fill("admin@clackforge.test")
  await page.getByLabel("Password", { exact: true }).fill("AdminDemo123!")
  // Scoped to `role="main"` - the header also renders a "Sign in" link
  // (same accessible name, `role="button"` styling) that otherwise collides
  // in a strict-mode lookup.
  await page.getByRole("main").getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL("**/account")
  return { context, page }
}

async function openFoundryVariant(page: Page): Promise<Locator> {
  await page.goto("/admin/products", { waitUntil: "networkidle" })
  // Scoped to `role="main"` - the header also has a "Search products"
  // button whose accessible name matches `/search/i`.
  await page.getByRole("main").getByLabel(/search/i).fill(PRODUCT_NAME)
  await page.keyboard.press("Enter")
  await page.getByRole("link", { name: PRODUCT_NAME }).click()
  await page.waitForURL(/\/admin\/products\/.+/)
  const stockInput = page.getByRole("spinbutton", { name: `Stock for ${VARIANT_NAME}` })
  await expect(stockInput).toBeVisible()
  return stockInput
}

async function setStockAndCommit(stockInput: Locator, value: number) {
  await stockInput.fill(String(value))
  await stockInput.blur()
}

test.describe("Flow 2 (spec §9 item 5): admin stock change → shop reflects it", () => {
  // Both tests below mutate the SAME fixture variant (Foundry TKL / Smoke)
  // - forced serial so they can't race each other under
  // `playwright.config.ts`'s `fullyParallel: true` (confirmed live: running
  // them concurrently intermittently has one test's zero-stock write land
  // mid-way through the other's "still has stock" assertions).
  test.describe.configure({ mode: "serial" })

  test("increasing stock in admin is reflected on the shop product page for a separate customer context", async ({ browser }) => {
    const { context: adminContext, page: adminPage } = await loginAsAdmin(browser)
    const stockInput = await openFoundryVariant(adminPage)

    const newStock = 37
    await setStockAndCommit(stockInput, newStock)
    // Optimistic + server-confirmed: the input should settle on the new
    // value (not roll back to the old one), confirming the mutation
    // actually succeeded rather than silently failing closed.
    await expect(stockInput).toHaveValue(String(newStock), { timeout: 10_000 })

    // Separate customer context - fresh cookies/cache, not the admin's tab.
    const customerContext = await browser.newContext()
    const customerPage = await customerContext.newPage()
    await customerPage.goto(`/shop/${PRODUCT_SLUG}`, { waitUntil: "networkidle" })

    await expect(customerPage.getByRole("heading", { name: PRODUCT_NAME })).toBeVisible()
    // Select the Smoke variant explicitly (shop page defaults to the first
    // variant, which may not be Smoke). `getByRole("radio", ...)` rather
    // than `getByLabel` - base-ui's `RadioGroupItem` renders BOTH a visible
    // `span[role=radio]` and a hidden native `input[type=radio]` sharing
    // the same label association, which otherwise collides in a
    // strict-mode `getByLabel` lookup.
    await customerPage.getByRole("radio", { name: new RegExp(VARIANT_NAME, "i") }).click()

    const addToCartButton = customerPage.getByRole("button", { name: /^add to cart$/i })
    await expect(addToCartButton).toBeEnabled()
    // Quantity stepper's max is wired to the live variant stock
    // (`maxQuantity = Math.max(1, selectedVariant.stock)` in ShopProduct.tsx)
    // - bump to max and confirm it reaches the NEW stock figure, not the
    // stale seeded one, as independent confirmation beyond just "not
    // out of stock".
    const increaseButton = customerPage.getByRole("button", { name: "Increase quantity" })
    // Click until the stepper caps out on its own (it's disabled once
    // `quantity >= maxQuantity`, which is wired straight to the live
    // variant's stock) - not a fixed count, since clicking past the cap
    // would otherwise hang waiting for a permanently-disabled button.
    for (let i = 0; i < newStock + 5 && (await increaseButton.isEnabled()); i++) {
      await increaseButton.click()
    }
    await expect(customerPage.locator("#quantity")).toHaveText(String(newStock))
    await expect(increaseButton).toBeDisabled()

    await adminContext.close()
    await customerContext.close()
  })

  test("setting stock to 0 in admin makes the shop page show it as out-of-stock/unavailable", async ({ browser }) => {
    const { context: adminContext, page: adminPage } = await loginAsAdmin(browser)
    const stockInput = await openFoundryVariant(adminPage)

    await setStockAndCommit(stockInput, 0)
    await expect(stockInput).toHaveValue("0", { timeout: 10_000 })

    const customerContext = await browser.newContext()
    const customerPage = await customerContext.newPage()
    await customerPage.goto(`/shop/${PRODUCT_SLUG}`, { waitUntil: "networkidle" })

    // `ShopProduct.tsx`'s real derivation for a variant-bearing product:
    // `lineInStock = (selectedVariant?.stock ?? 0) > 0`, and each variant
    // option's `RadioGroupItem` gets `disabled={variant.stock <= 0}`. Smoke
    // is not the default-selected variant (Clear is first, and still has
    // real stock) - this test does NOT click the now-disabled Smoke radio
    // (a disabled option can't be clicked in the first place); it asserts
    // the disabled state directly, which is itself proof the zero-stock
    // write landed and is live on this fresh customer context's fetch.
    const variantRadio = customerPage.getByRole("radio", { name: new RegExp(VARIANT_NAME, "i") })
    await expect(variantRadio).toBeDisabled()
    await expect(customerPage.getByText(/smoke\s*\(out of stock\)/i)).toBeVisible()

    // Clear (the default-selected variant) still has stock, so the page's
    // single shared "Add to cart"/"Out of stock" button reflects Clear's
    // availability, not Smoke's - select Clear is already the default, no
    // action needed; this just confirms the page overall didn't fall into
    // a broken all-out-of-stock state from one variant's zeroing.
    await expect(customerPage.getByRole("button", { name: /^add to cart$/i })).toBeEnabled()

    // Restore a non-zero stock afterward so this test doesn't leave the
    // fixture permanently zeroed for any later/parallel run that also
    // targets Foundry TKL / Smoke.
    await setStockAndCommit(stockInput, 12)
    await expect(stockInput).toHaveValue("12", { timeout: 10_000 })

    await adminContext.close()
    await customerContext.close()
  })
})
