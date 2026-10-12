export { cn } from "cn"

/** Integer cents -> localized currency string, e.g. `3200, "usd"` -> "$32.00". */
export function formatCents(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

/**
 * Dollars-input-string <-> integer-cents helpers, promoted here (not
 * duplicated) since the admin product form needs the exact same
 * conversion `features/catalog/ProductFilters.tsx` already does inline for
 * its min/max price filters. `undefined` on blank/invalid/negative input -
 * don't fire a doomed request/write on a transient bad value.
 */
export function dollarsInputToCents(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const dollars = Number(trimmed)
  if (!Number.isFinite(dollars) || dollars < 0) return undefined
  return Math.round(dollars * 100)
}

/** Integer cents -> a plain (non-currency-formatted) dollar string for an editable `<input type="number">`, e.g. `3200 -> "32"`. */
export function centsToDollarsInputValue(cents: number | undefined): string {
  return cents === undefined ? "" : String(cents / 100)
}

