import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

/**
 * axe accessibility sweep over every major page.
 *
 * Scope: every guest-reachable page (home, shop, product, switch detail and
 * compare, drop, build, cart, login/register, about, 404), then every
 * `/admin/*` route through the real "Try as admin" button (a genuine session,
 * not a mock). Checkout and Account are checked in their guest
 * (redirect-to-login) state; their signed-in flows live in the E2E suites.
 *
 * Seed-data slugs are hardcoded below. If the seed data changes, update them.
 */
const GUEST_PAGES: Array<{ name: string; path: string }> = [
  { name: "Home", path: "/" },
  { name: "Shop", path: "/shop" },
  { name: "ShopProduct", path: "/shop/desk-riser-mini" },
  { name: "SwitchDetail", path: "/switches/slimline-linear" },
  { name: "SwitchCompare", path: "/switches/compare" },
  { name: "DropDetail", path: "/drop/aurora-reserve" },
  { name: "Build", path: "/build" },
  { name: "Cart", path: "/cart" },
  { name: "Checkout (guest, redirects to login)", path: "/checkout" },
  { name: "Account (guest, redirects to login)", path: "/account" },
  { name: "Login", path: "/login" },
  { name: "Register", path: "/register" },
  { name: "About", path: "/about" },
  { name: "NotFound", path: "/this-page-does-not-exist" },
]

const ADMIN_PAGES: Array<{ name: string; path: string }> = [
  { name: "AdminDashboard", path: "/admin/dashboard" },
  { name: "AdminProducts", path: "/admin/products" },
  { name: "AdminOrders", path: "/admin/orders" },
  { name: "AdminGroupBuy", path: "/admin/group-buy" },
]

/** Shared assertion: scan the current page, fail with a readable summary if axe found anything. */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const summary = results.violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    .join("\n")
  expect(results.violations, `${label} had axe violations:\n${summary}`).toEqual([])
}

for (const { name, path } of GUEST_PAGES) {
  test(`axe: ${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" })
    await expectNoViolations(page, name)
  })
}

test("axe: admin routes (via real 'Try as admin' login)", async ({ page }) => {
  await page.goto("/about", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: /try as admin/i }).click()
  // Real network round trip to the demo-admin auth endpoint, not a fixed
  // timeout substitute for one - wait for the page to actually leave
  // `/about` (the mutation's own success handler doesn't navigate, so this
  // just confirms the session cookie landed before we drive to /admin/*).
  await page.waitForLoadState("networkidle")

  for (const { name, path } of ADMIN_PAGES) {
    await page.goto(path, { waitUntil: "networkidle" })
    await expectNoViolations(page, name)
  }
})
