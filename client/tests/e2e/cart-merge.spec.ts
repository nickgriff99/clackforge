import { randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"

/**
 * Guest cart -> sign in -> cart merges correctly.
 *
 * Merge rule under test (see `shared/src/cart.ts`): for each guest line, if the
 * account's cart already has the same `productId:variantId:customBuildId` key,
 * the quantities add onto that row (no duplicate line). Otherwise a new row is
 * inserted using the live catalog price and name, never the guest payload's.
 *
 * Both products used below are seeded with real stock. The test accepts
 * whichever variant the product page defaults to, as long as the guest add and
 * the pre-login server add use the same product so the line keys collide.
 */

function uniqueEmail(label: string): string {
  return `e2e-${label}-${randomUUID()}@example.com`
}

async function addFirstVariantToCart(page: Page, slug: string, quantity: number) {
  await page.goto(`/shop/${slug}`, { waitUntil: "networkidle" })
  for (let i = 1; i < quantity; i++) {
    await page.getByRole("button", { name: "Increase quantity" }).click()
  }
  await page.getByRole("button", { name: "Add to cart" }).click()
  await expect(page.getByText("Added to cart")).toBeVisible()
}

/** Header cart trigger's accessible name is `Cart, N item(s)` (Header.tsx) - the one count every surface (badge + this) must agree with. */
async function getCartBadgeCount(page: Page): Promise<number> {
  const button = page.getByRole("button", { name: /^Cart, \d+ items?$/ })
  const label = await button.getAttribute("aria-label")
  const match = label?.match(/Cart, (\d+) item/)
  if (!match) throw new Error(`Could not parse cart count from aria-label "${label}"`)
  return Number(match[1])
}

async function registerFreshAccount(page: Page, email: string) {
  await page.goto("/register", { waitUntil: "networkidle" })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill("testpass123")
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByText("Account created")).toBeVisible()
}

async function logIn(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "networkidle" })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill("testpass123")
  // Scoped to `main` - the signed-out header also renders its own "Sign in" link
  // (Header.tsx's `AccountMenu`), which otherwise makes this ambiguous.
  await page.getByRole("main").getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByText("Welcome back")).toBeVisible()
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: /Account menu, signed in as/ }).click()
  await page.getByRole("menuitem", { name: "Log out" }).click()
  await expect(page.getByText("Signed out")).toBeVisible()
}

/** Reads the guest cart's own localStorage key directly - the ground truth for "did `clear()` actually run after merge." */
async function getGuestCartLocalStorage(page: Page): Promise<unknown[]> {
  const raw = await page.evaluate(() => localStorage.getItem("clackforge:cart"))
  if (!raw) return []
  const parsed = JSON.parse(raw) as { state?: { items?: unknown[] } }
  return parsed.state?.items ?? []
}

test.describe("Guest cart → log in → cart merge ", () => {
  test("no prior server-side conflict: guest items persist across reload, then land in the merged server cart", async ({
    page,
  }) => {
    await addFirstVariantToCart(page, "desk-riser-mini", 1)
    await addFirstVariantToCart(page, "foundry-tkl", 2)
    expect(await getCartBadgeCount(page)).toBe(3)

    // Guest cart is localStorage-backed - must survive a reload while still signed out.
    await page.reload({ waitUntil: "networkidle" })
    expect(await getCartBadgeCount(page)).toBe(3)
    expect(await getGuestCartLocalStorage(page)).toHaveLength(2)

    const email = uniqueEmail("nomerge-conflict")
    await registerFreshAccount(page, email)

    // Merge fires once off the isAuthenticated transition (useCartMerge.ts) - poll, don't assume instant.
    await expect.poll(() => getCartBadgeCount(page)).toBe(3)

    await page.goto("/cart", { waitUntil: "networkidle" })
    await expect(page.getByText("Desk Riser Mini", { exact: false })).toBeVisible()
    await expect(page.getByText("Foundry TKL", { exact: false })).toBeVisible()

    // Guest store's `clear()` must have actually run (useCartMerge.ts's onSuccess) - real evidence, not inferred.
    expect(await getGuestCartLocalStorage(page)).toHaveLength(0)

    // Reload post-merge: cart must now be reading from the SERVER cart (guest store is empty per the line above),
    // proving useCart()'s branch really switched, not just that the badge number happened to still match.
    await page.reload({ waitUntil: "networkidle" })
    expect(await getCartBadgeCount(page)).toBe(3)
    await expect(page.getByText("Desk Riser Mini", { exact: false })).toBeVisible()
    await expect(page.getByText("Foundry TKL", { exact: false })).toBeVisible()
  })

  test("merge-conflict rule: a guest line matching an existing DB line ADDS quantities onto one row, never duplicates it", async ({
    page,
  }) => {
    const email = uniqueEmail("merge-conflict")
    await registerFreshAccount(page, email)

    // Seed a real SERVER-side cart line first (signed in).
    await addFirstVariantToCart(page, "anvil-65", 1)
    await expect.poll(() => getCartBadgeCount(page)).toBe(1)

    await logOut(page)

    // Same browser/page, now signed out - add a CONFLICTING guest line (same product+variant,
    // since ShopProduct.tsx deterministically defaults to the same `variants[0]`) plus one new line.
    await addFirstVariantToCart(page, "anvil-65", 2)
    await addFirstVariantToCart(page, "desk-riser-mini", 1)
    expect(await getCartBadgeCount(page)).toBe(3)
    expect(await getGuestCartLocalStorage(page)).toHaveLength(2)

    await logIn(page, email)
    // Expected per shared/src/cart.ts's MergeCartInputSchema doc comment: 1 (existing) + 2 (guest) = 3 on
    // the SAME Anvil 65 row, plus the new Desk Riser Mini row at 1 - total count 4, NOT 5 lines/qty.
    await expect.poll(() => getCartBadgeCount(page)).toBe(4)

    await page.goto("/cart", { waitUntil: "networkidle" })
    // Exactly ONE name match proves the merge collapsed onto one row rather than inserting a
    // second "Anvil 65 (Graphite)" line alongside the pre-existing one (CartItemRow.tsx renders
    // `item.name` verbatim, and ShopProduct.tsx always names the line "<product> (<variant>)").
    const anvilName = page.getByText("Anvil 65 (Graphite)", { exact: true })
    await expect(anvilName).toHaveCount(1)
    // CartItemRow.tsx's DOM shape: name span -> flex-col column div -> row root div, with the
    // quantity's `aria-live="polite"` span a sibling further down that same column.
    const anvilRow = anvilName.locator("..").locator("..")
    await expect(anvilRow.locator('[aria-live="polite"]').first()).toHaveText("3")
    await expect(page.getByText("Desk Riser Mini", { exact: false })).toBeVisible()

    expect(await getGuestCartLocalStorage(page)).toHaveLength(0)
  })
})
