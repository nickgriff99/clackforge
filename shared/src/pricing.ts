import { z } from "zod"
import { CentsSchema, type Cents, type Id } from "./common"
import { BuildSlotSchema, CURRENT_BUILD_CONFIG_VERSION, type BuildConfig, type BuildLayoutId, type BuildSlot } from "./build"
import { COMPATIBILITY_RULES, type CompatibilityRule } from "./compatibility"
import { CONFIGURATOR_OPTIONS, LAYOUT_LABELS, type ConfiguratorOption } from "./options"

/**
 * Configurator pricing engine: `calculatePrice(config, catalog, basePrice)`
 * -> a discriminated `PriceResult`, with unit tests in
 * `shared/src/pricing.test.ts`. The server recalculates price at checkout;
 * the client's own computed total is never trusted.
 *
 * `catalog` is an explicit parameter rather than a hardcoded import of
 * `options.ts`/`compatibility.ts`'s live singletons - `DEFAULT_CATALOG`
 * below bundles those for every real caller, while tests can pass small,
 * focused fixture catalogs instead of asserting against the full production
 * catalog.
 *
 * ERROR-HANDLING CONTRACT: `calculatePrice` NEVER THROWS. It returns a
 * discriminated `PriceResult` instead, for two reasons:
 *   1. This function is called from TWO very different trust contexts in
 *      the same codebase - the LIVE client configurator (where a
 *      momentarily-incomplete or UI-blocked-but-still-in-state selection
 *      must never crash the page) and the SERVER add-to-cart/checkout path
 *      (where a tampered request bypassing the UI's own disabled-button
 *      guards is a real, expected adversarial input, not an exceptional
 *      programmer error). Neither caller should need a try/catch around a
 *      pure data function.
 *   2. It matches this codebase's own convention for untrusted input at a
 *      boundary (see `shared/src/cart.ts`'s "never silently invent data,
 *      never throw into a live pipeline" approach) - a result object a
 *      caller MUST branch on (`if (result.ok)`) is a compile-time-enforced
 *      version of the same discipline a try/catch relies on human diligence
 *      for.
 *
 * An INVALID/INCOMPATIBLE selection (unknown option id, an option id that
 * belongs to the wrong slot, a violated compatibility rule, or a
 * `basePrice.productId` that doesn't match `config.productId`) returns
 * `{ ok: false, error }` and applies NO price delta at all - the whole
 * result is rejected, not just the offending line, so a caller (e.g. the
 * cart route) can turn `ok: false` directly into a 400/409 `ApiError`
 * without auditing which individual line items are "real."
 *
 * A MISSING (unset) optional slot is NOT an error - `config.selections` is
 * a `Partial`, and a build mid-configuration (or one that deliberately skips
 * an optional extra like `artisanKeycap`) prices correctly as "base + every
 * slot that IS set," with no line item for the unset ones. Only
 * `config.layout` has no "missing" state to handle, since
 * `BuildConfigSchema` already makes it required - a config missing it never
 * reaches this function as a valid `BuildConfig` in the first place (Zod
 * rejects it first).
 *
 * A VERSION MISMATCH (`config.version !== CURRENT_BUILD_CONFIG_VERSION`)
 * also returns `{ ok: false, error: { code: "VERSION_UNSUPPORTED" } }`
 * rather than attempting to migrate - migrating an old serialized config to
 * the current shape is a separate concern from this pure pricing function.
 *
 * LAYERING NOTE for callers (same convention as `cart.ts`'s
 * `calculateCartTotals`): this function takes an already-typed `BuildConfig`
 * and does NOT re-run `BuildConfigSchema.safeParse` internally. A route
 * handler receiving a raw request body MUST call `BuildConfigSchema.parse`
 * (or `.safeParse`) first - `calculatePrice`'s own checks (version, product
 * match, layout, option ids, compatibility) are a second, DOMAIN-level pass
 * over an already-shape-valid object, not a substitute for the Zod
 * structural pass.
 */

export type PricingErrorCode =
  | "VERSION_UNSUPPORTED"
  | "PRODUCT_MISMATCH"
  | "UNKNOWN_LAYOUT"
  | "UNKNOWN_OPTION"
  | "INCOMPATIBLE_SELECTION"

export interface PricingError {
  code: PricingErrorCode
  message: string
}

export interface PriceLineItem {
  /** `"base"` for the configured product's own base price; a `BuildSlot` for every selected option. */
  slot: BuildSlot | "base"
  /** `null` for the `"base"` line. */
  optionId: string | null
  label: string
  priceCents: number
}

export type PriceResult =
  | { ok: true; lineItems: PriceLineItem[]; subtotal: Cents }
  | { ok: false; error: PricingError }

export interface ConfiguratorCatalog {
  options: ConfiguratorOption[]
  rules: CompatibilityRule[]
  layoutLabels: Record<BuildLayoutId, string>
}

/** The real, live catalog - what every production caller (client + server) should pass. */
export const DEFAULT_CATALOG: ConfiguratorCatalog = {
  options: CONFIGURATOR_OPTIONS,
  rules: COMPATIBILITY_RULES,
  layoutLabels: LAYOUT_LABELS,
}

/**
 * The configured product's own live base price - a DB fact this module has
 * no access to (this is a pure function, no I/O). The caller (client: from
 * its already-fetched `ProductDetail`; server: from its own Prisma read)
 * must pass the CURRENTLY-fetched product's id + price, which is cheap
 * insurance against a caller accidentally pricing against the wrong
 * product's base (`PRODUCT_MISMATCH` below catches that class of bug loudly
 * instead of silently mispricing).
 */
export interface BuildBasePrice {
  productId: Id
  priceCents: Cents
}

function err(code: PricingErrorCode, message: string): PriceResult {
  return { ok: false, error: { code, message } }
}

export function calculatePrice(config: BuildConfig, catalog: ConfiguratorCatalog, basePrice: BuildBasePrice): PriceResult {
  if (config.version !== CURRENT_BUILD_CONFIG_VERSION) {
    return err(
      "VERSION_UNSUPPORTED",
      `This build was saved against config version ${config.version}, but version ${CURRENT_BUILD_CONFIG_VERSION} is current. Migrate it before pricing.`,
    )
  }

  if (basePrice.productId !== config.productId) {
    return err(
      "PRODUCT_MISMATCH",
      `calculatePrice was called with base price for product "${basePrice.productId}" but the build is for "${config.productId}".`,
    )
  }

  const layoutLabel = catalog.layoutLabels[config.layout]
  if (!layoutLabel) {
    return err("UNKNOWN_LAYOUT", `"${config.layout}" is not a recognized keyboard layout.`)
  }

  const violated = catalog.rules.filter((rule) => rule.isViolated(config.selections, config.layout))
  if (violated.length > 0) {
    return err("INCOMPATIBLE_SELECTION", violated.map((rule) => rule.reason).join(" "))
  }

  const lineItems: PriceLineItem[] = [
    {
      slot: "base",
      optionId: null,
      label: `Base kit (${layoutLabel})`,
      priceCents: basePrice.priceCents,
    },
  ]

  for (const [slot, optionId] of Object.entries(config.selections) as [BuildSlot, string | undefined][]) {
    if (optionId === undefined) continue

    const option = catalog.options.find((o) => o.id === optionId)
    if (!option) {
      return err("UNKNOWN_OPTION", `"${optionId}" is not a recognized option for the "${slot}" slot.`)
    }
    if (option.slot !== slot) {
      return err("UNKNOWN_OPTION", `Option "${optionId}" belongs to slot "${option.slot}", not "${slot}".`)
    }

    lineItems.push({
      slot,
      optionId: option.id,
      label: option.label,
      priceCents: option.priceDeltaCents,
    })
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.priceCents, 0)

  return { ok: true, lineItems, subtotal }
}

// ---------------------------------------------------------------------------
// Wire (Zod) mirror of the TS types above. `calculatePrice` was, until now,
// only ever called from code that already trusts its own process (client
// UI, server routes) - nothing put a `PriceResult` on the wire as JSON.
// `GET /api/builds/:id` (the public share/detail route) is the first caller
// to do that, and it deliberately needs the FULL discriminated union
// (including the `ok: false` branch), not just the success shape: per this
// file's own "never throws" philosophy, a share link whose build's catalog
// references later drift (a removed/renamed option id) should still return
// 200 and render the build's config/3D model, with price shown as
// "unavailable", rather than 500 the whole page over a pricing-only
// failure. `POST /api/builds` (the save route) does NOT use this
// discriminated schema for its own response - it rejects a failed
// `calculatePrice` call with a 400 `ApiError` before ever writing a row, so
// only the success shape (`PriceBreakdownSchema` below) ever reaches that
// route's response body.
// ---------------------------------------------------------------------------

export const PricingErrorCodeSchema = z.enum([
  "VERSION_UNSUPPORTED",
  "PRODUCT_MISMATCH",
  "UNKNOWN_LAYOUT",
  "UNKNOWN_OPTION",
  "INCOMPATIBLE_SELECTION",
])

export const PriceLineItemSchema = z.object({
  slot: z.union([BuildSlotSchema, z.literal("base")]),
  optionId: z.string().nullable(),
  label: z.string().min(1),
  priceCents: CentsSchema,
})

export const PricingErrorSchema = z.object({
  code: PricingErrorCodeSchema,
  message: z.string(),
})

/**
 * Success-only shape. Use this (not `PriceResultSchema`) for any route that
 * already guarantees `ok: true` before it ever builds a response body -
 * e.g. `POST /api/builds`, which 400s on a failed `calculatePrice` call
 * instead of including the failure in a 200 response.
 */
export const PriceBreakdownSchema = z.object({
  lineItems: z.array(PriceLineItemSchema),
  subtotal: CentsSchema,
})
export type PriceBreakdown = z.infer<typeof PriceBreakdownSchema>

/**
 * Full discriminated-union mirror of `PriceResult`. Use this for any route
 * where a failed recompute must still reach the client inside a 200 response
 * (currently only `GET /api/builds/:id` - see its doc comment in
 * shared/src/api.ts). A consumer must branch on `.ok` same as any in-process
 * caller of `calculatePrice` would.
 */
export const PriceResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), lineItems: z.array(PriceLineItemSchema), subtotal: CentsSchema }),
  z.object({ ok: z.literal(false), error: PricingErrorSchema }),
])
