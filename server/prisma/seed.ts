/**
 * CLACKFORGE catalog seed. All names/specs/copy are invented for this
 * brand, no real trademarks, no placeholder text.
 *
 * `CUSTOM_BUILD` is deliberately not seeded as a catalog row here - per
 * schema.prisma, `CustomBuild` rows are generated per-user by the
 * configurator, not fixed catalog data. A `Product.category = CUSTOM_BUILD`
 * row would only make sense as a single "start a build" catalog tile if the
 * Shop page ever needs one; not built since nothing consumes it yet (would
 * be dead seed data).
 *
 * `inStock` test coverage baked into this data on purpose (see
 * shared/src/product.ts derivation rule):
 *   - zero-variant products ("always in stock" rule): beacon-novelties,
 *     switch-puller-pro, keycap-puller-wire, stabilizer-tuning-kit
 *   - fully out-of-stock products (every variant stock = 0): sunder-tkl,
 *     glacier-linear, midnight-spherical
 *   - partially out-of-stock (one variant 0, still inStock via the other):
 *     bastion-75, monolith-60, forge-carry-case
 *
 * ---------------------------------------------------------------------------
 * `seedAll(prisma)` + wipe-then-reseed, read this before touching anything
 * below.
 * ---------------------------------------------------------------------------
 *
 * `POST /api/admin/reset-demo-data` (`shared/src/adminDashboard.ts`'s
 * `AdminResetDemoDataResponseSchema`) needs to run this exact seeding logic
 * from inside the already-running Express process, against the app's
 * already-connected shared Prisma client (`server/src/db/prisma.ts`'s
 * `export const prisma`) - so the real work lives in `export async function
 * seedAll(prisma: PrismaClient): Promise<SeedCounts>`, which takes the
 * Prisma client as a parameter instead of owning its own module-scoped
 * instance. The CLI entry point at the bottom of this file is a thin
 * wrapper: it only runs `seedAll` (creating + disconnecting its own
 * `PrismaClient`) when this file is executed directly (`npm run
 * prisma:seed`, i.e. `tsx prisma/seed.ts`) - guarded via `import.meta.url ===
 * pathToFileURL(process.argv[1]).href`, the standard ESM "is this the main
 * module" check - never when `seedAll` is imported by the reset-demo-data
 * route.
 *
 * `seedAll` does a full wipe before reseeding (see `wipeDemoData` below),
 * not just an upsert re-run - "reset demo data" means "every order/build a
 * reviewer created while clicking around is gone, catalog/drop go back to
 * their pristine seeded state," which a pure upsert loop can't do (upserts
 * only touch rows this file knows about by slug/sku - they never delete a
 * stray `Order`/`CustomBuild`/etc. a live demo session created).
 *
 * `User` rows are never wiped or recreated - not the seeded admin, not any
 * real registered user. The admin user upsert below (`seedAdminUser`)
 * stays a plain upsert-by-email for password/role; it is not part of the
 * wipe.
 *
 * The wipe runs unconditionally at the top of `seedAll`, every single call
 * - including the very first `npm run prisma:seed` against a genuinely
 * empty dev DB. This is deliberate, not an oversight: deleting from empty
 * tables is a harmless no-op, so there is no need for a
 * "is this a reset or a first run" branch - one code path serves both
 * cases.
 *
 * Idempotent: every upsert in this file is keyed the same way
 * (slug/sku/email/orderNumber/fixed id) - safe to re-run.
 *
 * Run: `npm run prisma:seed` (or `prisma db seed`) from /server.
 */
import { PrismaClient, type ProductType } from "@prisma/client"
import { hash } from "bcryptjs"
import { pathToFileURL } from "node:url"
import {
  calculatePrice,
  calculateCartTotals,
  CURRENT_BUILD_CONFIG_VERSION,
  DEFAULT_CATALOG,
  type BuildConfig,
  type BuildLayoutId,
  type BuildSlot,
  type CartItemSnapshot,
} from "@shared"
import { DEMO_ADMIN_EMAIL } from "../src/config/demoAdmin"

// Admin login for the "Try as admin" demo flow. Same hashing path as the
// real register route (server/src/routes/auth.ts) - bcryptjs, cost factor
// 12 - reused verbatim, not a second hashing mechanism. The email itself
// lives in `../src/config/demoAdmin.ts` (shared with
// `POST /api/auth/try-as-admin`) - don't re-add a local `ADMIN_EMAIL`
// const here, import the one constant instead.
const ADMIN_BCRYPT_ROUNDS = 12
const ADMIN_PASSWORD = "AdminDemo123!"

/** Matches `AdminResetDemoDataResponseSchema.counts` (shared/src/adminDashboard.ts) field-for-field. */
export interface SeedCounts {
  products: number
  variants: number
  orders: number
  customBuilds: number
  groupBuyDrops: number
}

interface SeedVariant {
  sku: string
  name: string
  priceDelta: number
  attributes: Record<string, string>
  stock: number
}

interface SeedProduct {
  slug: string
  name: string
  tagline: string
  description: string
  category: ProductType
  basePrice: number
  specs: Record<string, string>
  isConfigurable: boolean
  variants: SeedVariant[]
}

// Images are intentionally empty: no asset pipeline exists yet.
const products: SeedProduct[] = [
  {
    slug: "anvil-65",
    name: "Anvil 65",
    tagline: "Dense body, zero flex.",
    description:
      "A 65% aluminum kit machined to feel like one solid block. The Anvil 65 " +
      "skips every rattle-prone shortcut: gasket mount for controlled give, " +
      "a weighted bottom plate, and a burr-free CNC finish you can feel at " +
      "the edges. Built as the base kit for CLACKFORGE's configurator.",
    category: "KIT",
    basePrice: 24900,
    specs: {
      Layout: "65%",
      Material: "CNC Aluminum",
      Mount: "Gasket",
      Weight: "1.4 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    isConfigurable: true,
    variants: [
      {
        sku: "ANV65-GRA",
        name: "Graphite",
        priceDelta: 0,
        attributes: { Color: "Graphite" },
        stock: 24,
      },
      {
        sku: "ANV65-AMB",
        name: "Forge Amber",
        priceDelta: 1000,
        attributes: { Color: "Forge Amber" },
        stock: 10,
      },
    ],
  },
  {
    slug: "foundry-tkl",
    name: "Foundry TKL",
    tagline: "Full travel, see-through soul.",
    description:
      "A tenkeyless polycarbonate kit for builders who want to see the guts " +
      "of the build and hear every bit of it. Top-mounted for a softer, " +
      "more forgiving typing feel than the Anvil, with a deeper, warmer " +
      "sound signature out of the box.",
    category: "KIT",
    basePrice: 21900,
    specs: {
      Layout: "TKL",
      Material: "Polycarbonate",
      Mount: "Top mount",
      Weight: "1.1 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    isConfigurable: true,
    variants: [
      {
        sku: "FDY-TKL-CLR",
        name: "Clear",
        priceDelta: 0,
        attributes: { Color: "Clear" },
        stock: 18,
      },
      {
        sku: "FDY-TKL-SMK",
        name: "Smoke",
        priceDelta: 500,
        attributes: { Color: "Smoke" },
        stock: 12,
      },
    ],
  },
  {
    slug: "ember-linear",
    name: "Ember Linear",
    tagline: "Smooth as a cooling ingot.",
    description:
      "A factory-lubed linear switch tuned for a long, consistent travel " +
      "with no scratch. Ember is the house linear: quiet-leaning, deep in " +
      "tone, and built to hold up through a full group-buy run.",
    category: "SWITCH",
    basePrice: 900,
    specs: {
      Feel: "Linear",
      "Actuation Force": "45g",
      "Bottom-Out Force": "58g",
      Travel: "4.0mm",
      Sound: "Deep thock",
    },
    isConfigurable: false,
    variants: [
      {
        sku: "EMB-LIN-10",
        name: "Pack of 10",
        priceDelta: 0,
        attributes: { "Pack Size": "10" },
        stock: 200,
      },
      {
        sku: "EMB-LIN-70",
        name: "Pack of 70",
        priceDelta: 5400,
        attributes: { "Pack Size": "70" },
        stock: 60,
      },
      {
        sku: "EMB-LIN-90",
        name: "Pack of 90",
        priceDelta: 7200,
        attributes: { "Pack Size": "90" },
        stock: 40,
      },
    ],
  },
  {
    slug: "riot-clicky",
    name: "Riot Clicky",
    tagline: "Loud on purpose.",
    description:
      "A sharp, high-pitched clicky switch for builders who want the room " +
      "to know they're typing. Crisp click bar actuation with a snappy " +
      "reset, no mush, no delay.",
    category: "SWITCH",
    basePrice: 1000,
    specs: {
      Feel: "Clicky",
      "Actuation Force": "50g",
      "Bottom-Out Force": "62g",
      Travel: "4.0mm",
      Sound: "Sharp snap",
    },
    isConfigurable: false,
    variants: [
      {
        sku: "RIOT-CLK-10",
        name: "Pack of 10",
        priceDelta: 0,
        attributes: { "Pack Size": "10" },
        stock: 150,
      },
      {
        sku: "RIOT-CLK-70",
        name: "Pack of 70",
        priceDelta: 5000,
        attributes: { "Pack Size": "70" },
        stock: 50,
      },
      {
        sku: "RIOT-CLK-90",
        name: "Pack of 90",
        priceDelta: 6800,
        attributes: { "Pack Size": "90" },
        stock: 30,
      },
    ],
  },
  {
    slug: "signal-set",
    name: "Signal Set",
    tagline: "Legends that glow under the hood.",
    description:
      "A dye-sublimated PBT keycap set in graphite and switch-LED cyan, cut " +
      "for a cylindrical profile. Legends are thin enough for clean " +
      "backlight shine-through on every alpha.",
    category: "KEYCAP_SET",
    basePrice: 8900,
    specs: {
      Profile: "Cylindrical",
      Material: "PBT Dye-Sub",
      Kit: "Base kit",
      Legends: "Shine-through",
    },
    isConfigurable: false,
    variants: [
      {
        sku: "SIG-STD",
        name: "Standard Kit",
        priceDelta: 0,
        attributes: { Kit: "Standard" },
        stock: 40,
      },
      {
        sku: "SIG-FULL",
        name: "Full Kit (+novelties)",
        priceDelta: 2200,
        attributes: { Kit: "Full" },
        stock: 20,
      },
    ],
  },
  {
    slug: "forge-deskmat",
    name: "Forge Deskmat",
    tagline: "Catch the crumbs, keep the clack.",
    description:
      "A stitched-edge desk mat sized for a full keyboard-and-mouse setup, " +
      "with a rubber base that doesn't creep on glass desks.",
    category: "ACCESSORY",
    basePrice: 2900,
    specs: {
      Size: "900 x 400mm",
      Material: "Woven top, rubber base",
      Edge: "Stitched",
    },
    isConfigurable: false,
    variants: [
      {
        sku: "FDM-GRA",
        name: "Graphite",
        priceDelta: 0,
        attributes: { Color: "Graphite" },
        stock: 60,
      },
      {
        sku: "FDM-AMB",
        name: "Amber Edge",
        priceDelta: 0,
        attributes: { Color: "Amber Edge" },
        stock: 35,
      },
    ],
  },
  {
    slug: "coil-cable-amber",
    name: "Amber Coil Cable",
    tagline: "A little flex, a lot of style.",
    description:
      "A hand-wound coiled USB-C cable in forge amber, with a detachable " +
      "aviator connector at the keyboard end so it survives a travel bag.",
    category: "ACCESSORY",
    basePrice: 3400,
    specs: {
      Length: "1.5m coiled",
      Connector: "USB-C to USB-C",
      Coil: "Hand-wound",
    },
    isConfigurable: false,
    variants: [
      {
        sku: "COIL-AMB-150",
        name: "1.5m",
        priceDelta: 0,
        attributes: { Length: "1.5m" },
        stock: 80,
      },
      {
        sku: "COIL-AMB-180",
        name: "1.8m",
        priceDelta: 400,
        attributes: { Length: "1.8m" },
        stock: 80,
      },
    ],
  },

  {
    slug: "bastion-75",
    name: "Bastion 75",
    tagline: "The function row stays, the bulk doesn't.",
    description:
      "A dense 75% aluminum kit for builders who won't give up F-keys or a " +
      "nav cluster. Gasket-mounted like the Anvil but narrower, with a " +
      "stepped top case that keeps the function row within reach without " +
      "adding desk footprint.",
    category: "KIT",
    basePrice: 26900,
    specs: {
      Layout: "75%",
      Material: "CNC Aluminum",
      Mount: "Gasket",
      Weight: "1.3 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    isConfigurable: true,
    variants: [
      { sku: "BAS75-GRA", name: "Graphite", priceDelta: 0, attributes: { Color: "Graphite" }, stock: 15 },
      { sku: "BAS75-ONX", name: "Onyx", priceDelta: 800, attributes: { Color: "Onyx" }, stock: 0 },
    ],
  },
  {
    slug: "drift-96",
    name: "Drift 96",
    tagline: "Full-size, full travel, full stop.",
    description:
      "A full-size polycarbonate kit for spreadsheet jockeys and numpad " +
      "loyalists who still want the Foundry's warm, see-through sound " +
      "signature. Top-mounted, softer bottom-out than the aluminum kits.",
    category: "KIT",
    basePrice: 22900,
    specs: {
      Layout: "Full-size (96%)",
      Material: "Polycarbonate",
      Mount: "Top mount",
      Weight: "1.2 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    // Must stay `false`: "Full-size (96%)" has no matching `BuildLayoutId`
    // anywhere in shared/src/build.ts or the configurator's 4-key
    // `BASE_KIT_SLUG_BY_LAYOUT` map, so `isConfigurable: true` here would be
    // a claim unreachable by any real code path (TypeScript itself blocks a
    // 5th key without widening `BuildLayoutId` first). See the
    // `CustomBuildDef` doc comment below for more on this gap.
    isConfigurable: false,
    variants: [
      { sku: "DRF96-CLR", name: "Clear", priceDelta: 0, attributes: { Color: "Clear" }, stock: 8 },
      { sku: "DRF96-SLT", name: "Slate", priceDelta: 400, attributes: { Color: "Slate" }, stock: 22 },
    ],
  },
  {
    slug: "monolith-60",
    name: "Monolith 60",
    tagline: "No arrows. No excuses.",
    description:
      "A compact 60% aluminum kit with the arrow cluster and nav keys cut " +
      "entirely: just the block, for builders who've already memorized " +
      "their layer taps. Heaviest kit in the lineup relative to its size.",
    category: "KIT",
    basePrice: 23900,
    specs: {
      Layout: "60%",
      Material: "CNC Aluminum",
      Mount: "Gasket",
      Weight: "1.1 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    isConfigurable: true,
    variants: [
      { sku: "MNL60-BLK", name: "Black", priceDelta: 0, attributes: { Color: "Black" }, stock: 30 },
      { sku: "MNL60-GRA", name: "Graphite", priceDelta: 0, attributes: { Color: "Graphite" }, stock: 0 },
    ],
  },
  {
    slug: "sunder-tkl",
    name: "Sunder TKL",
    tagline: "Steel-plate honesty, no extra flex.",
    description:
      "A tenkeyless steel-plate kit built for a firm, direct typing feel " +
      "with minimal gasket give. Currently between production runs. " +
      "Restocking is tracked on the product page.",
    category: "KIT",
    basePrice: 20900,
    specs: {
      Layout: "TKL",
      Material: "CNC Aluminum, steel plate",
      Mount: "Tray mount",
      Weight: "1.3 kg",
      Connectivity: "USB-C, hot-swap PCB",
    },
    isConfigurable: true,
    variants: [{ sku: "SNDR-TKL-BLK", name: "Black", priceDelta: 0, attributes: { Color: "Black" }, stock: 0 }],
  },
  {
    slug: "hearth-tactile",
    name: "Hearth Tactile",
    tagline: "A clear bump, every time.",
    description:
      "A factory-lubed tactile switch with a pronounced, consistent bump " +
      "early in the stroke. Hearth is the house tactile: rounded feel, " +
      "warm mid-range sound, no scratch through the bump.",
    category: "SWITCH",
    basePrice: 950,
    specs: {
      Feel: "Tactile",
      "Actuation Force": "52g",
      "Bottom-Out Force": "65g",
      Travel: "3.8mm",
      Sound: "Warm thock",
    },
    isConfigurable: false,
    variants: [
      { sku: "HRT-TAC-10", name: "Pack of 10", priceDelta: 0, attributes: { "Pack Size": "10" }, stock: 140 },
      { sku: "HRT-TAC-70", name: "Pack of 70", priceDelta: 5700, attributes: { "Pack Size": "70" }, stock: 45 },
      { sku: "HRT-TAC-90", name: "Pack of 90", priceDelta: 7600, attributes: { "Pack Size": "90" }, stock: 25 },
    ],
  },
  {
    slug: "glacier-linear",
    name: "Glacier Linear",
    tagline: "Light enough to float.",
    description:
      "An ultra-light linear switch tuned for rapid, low-effort presses. " +
      "Glacier trades bottom-out heft for speed, popular for fast typists " +
      "and gaming builds. Currently sold out site-wide while we re-lube the " +
      "next batch.",
    category: "SWITCH",
    basePrice: 850,
    specs: {
      Feel: "Linear",
      "Actuation Force": "38g",
      "Bottom-Out Force": "48g",
      Travel: "4.0mm",
      Sound: "Light clack",
    },
    isConfigurable: false,
    variants: [
      { sku: "GLC-LIN-10", name: "Pack of 10", priceDelta: 0, attributes: { "Pack Size": "10" }, stock: 0 },
      { sku: "GLC-LIN-70", name: "Pack of 70", priceDelta: 5000, attributes: { "Pack Size": "70" }, stock: 0 },
      { sku: "GLC-LIN-90", name: "Pack of 90", priceDelta: 6600, attributes: { "Pack Size": "90" }, stock: 0 },
    ],
  },
  {
    slug: "arc-clicky",
    name: "Arc Clicky",
    tagline: "A cleaner snap than Riot.",
    description:
      "A refined click-bar switch with a tighter, higher-pitched snap than " +
      "Riot and a shorter reset. Built for builders who want the click " +
      "without the room-filling volume.",
    category: "SWITCH",
    basePrice: 1050,
    specs: {
      Feel: "Clicky",
      "Actuation Force": "48g",
      "Bottom-Out Force": "60g",
      Travel: "3.8mm",
      Sound: "Tight snap",
    },
    isConfigurable: false,
    variants: [
      { sku: "ARC-CLK-10", name: "Pack of 10", priceDelta: 0, attributes: { "Pack Size": "10" }, stock: 120 },
      { sku: "ARC-CLK-70", name: "Pack of 70", priceDelta: 5900, attributes: { "Pack Size": "70" }, stock: 40 },
      { sku: "ARC-CLK-90", name: "Pack of 90", priceDelta: 7800, attributes: { "Pack Size": "90" }, stock: 20 },
    ],
  },
  {
    slug: "slimline-linear",
    name: "Slimline Linear",
    tagline: "Built for low-profile builds.",
    description:
      "A short-travel linear switch sized for low-profile plates and " +
      "cases. Same smooth stem-to-housing fit as Ember, scaled down for " +
      "builds that prioritize a slim deck height.",
    category: "SWITCH",
    basePrice: 1100,
    specs: {
      Feel: "Linear",
      "Actuation Force": "45g",
      "Bottom-Out Force": "55g",
      Travel: "3.2mm (low-profile)",
      Sound: "Soft tap",
    },
    isConfigurable: false,
    variants: [
      { sku: "SLM-LIN-10", name: "Pack of 10", priceDelta: 0, attributes: { "Pack Size": "10" }, stock: 90 },
      { sku: "SLM-LIN-70", name: "Pack of 70", priceDelta: 6200, attributes: { "Pack Size": "70" }, stock: 30 },
      { sku: "SLM-LIN-90", name: "Pack of 90", priceDelta: 8200, attributes: { "Pack Size": "90" }, stock: 15 },
    ],
  },
  {
    slug: "quarry-set",
    name: "Quarry Set",
    tagline: "Stonewash texture, matte finish.",
    description:
      "A dye-sublimated PBT keycap set in a stonewash grey colorway with a " +
      "lightly textured top surface. Cut for a cylindrical profile with " +
      "bold, high-contrast legends.",
    category: "KEYCAP_SET",
    basePrice: 9400,
    specs: {
      Profile: "Cylindrical",
      Material: "PBT Dye-Sub",
      Kit: "Base kit",
      Legends: "High-contrast, opaque",
    },
    isConfigurable: false,
    variants: [
      { sku: "QRY-STD", name: "Standard Kit", priceDelta: 0, attributes: { Kit: "Standard" }, stock: 30 },
      { sku: "QRY-FULL", name: "Full Kit (+novelties)", priceDelta: 2400, attributes: { Kit: "Full" }, stock: 12 },
    ],
  },
  {
    slug: "beacon-novelties",
    name: "Beacon Novelties",
    tagline: "Five accent keys, zero compromise.",
    description:
      "A small pack of five artisan-style novelty keycaps (Esc, Enter, " +
      "arrow trio) in a glow-cyan colorway, cast to match any CLACKFORGE " +
      "base kit. Sold as a single fixed pack with no variant options.",
    category: "KEYCAP_SET",
    basePrice: 4200,
    specs: {
      "Pack Contents": "Esc, Enter, 3x Arrow",
      Material: "Resin cast",
      Compatibility: "Cherry-profile stems",
    },
    isConfigurable: false,
    variants: [],
  },
  {
    slug: "midnight-spherical",
    name: "Midnight Spherical",
    tagline: "Rounded tops, deep navy.",
    description:
      "A spherical-profile PBT set in deep navy with silver legends, for " +
      "builders who prefer a rounder keycap top than the house cylindrical " +
      "profile. Between production runs. See the product page for restock.",
    category: "KEYCAP_SET",
    basePrice: 9900,
    specs: {
      Profile: "Spherical",
      Material: "PBT Dye-Sub",
      Kit: "Base kit",
      Legends: "Silver, opaque",
    },
    isConfigurable: false,
    variants: [{ sku: "MDN-STD", name: "Standard Kit", priceDelta: 0, attributes: { Kit: "Standard" }, stock: 0 }],
  },
  {
    slug: "switch-puller-pro",
    name: "Switch Puller Pro",
    tagline: "Pulls switches, not patience.",
    description:
      "A spring-loaded switch puller with a wire-free claw mechanism, " +
      "sized for hot-swap sockets. One fixed tool, no variants.",
    category: "ACCESSORY",
    basePrice: 1200,
    specs: {
      Mechanism: "Spring-loaded claw",
      Compatible: "Hot-swap MX-style sockets",
      Material: "ABS body, steel claw",
    },
    isConfigurable: false,
    variants: [],
  },
  {
    slug: "keycap-puller-wire",
    name: "Wire Keycap Puller",
    tagline: "The simple one, done right.",
    description:
      "A classic two-wire keycap puller with a soft-touch grip. Gentler on " +
      "keycap legends than ring-style pullers.",
    category: "ACCESSORY",
    basePrice: 600,
    specs: {
      Type: "Wire loop",
      Material: "Coated steel wire, rubber grip",
    },
    isConfigurable: false,
    variants: [],
  },
  {
    slug: "forge-carry-case",
    name: "Forge Carry Case",
    tagline: "Travel without the rattle.",
    description:
      "A padded hard-shell case sized for 60-75% keyboards, with a " +
      "foam-cutout interior that keeps a built keyboard from shifting in " +
      "transit.",
    category: "ACCESSORY",
    basePrice: 5900,
    specs: {
      Fits: "60% to 75% keyboards",
      Shell: "EVA hard-shell",
      Interior: "Die-cut foam",
    },
    isConfigurable: false,
    variants: [
      { sku: "FCC-GRA", name: "Graphite", priceDelta: 0, attributes: { Color: "Graphite" }, stock: 18 },
      { sku: "FCC-AMB", name: "Forge Amber", priceDelta: 500, attributes: { Color: "Forge Amber" }, stock: 0 },
    ],
  },
  {
    slug: "stabilizer-tuning-kit",
    name: "Stabilizer Tuning Kit",
    tagline: "Quiet the rattle, keep the bounce.",
    description:
      "Everything needed to tune a set of stabilizers: dielectric grease, " +
      "replacement bandaid-mod strips, and a small set of swap-in stab " +
      "housings. One fixed kit, no variants.",
    category: "ACCESSORY",
    basePrice: 1800,
    specs: {
      Contents: "Grease, bandaid strips, housings",
      Compatible: "Cherry-style plate-mount stabilizers",
    },
    isConfigurable: false,
    variants: [],
  },
  {
    slug: "desk-riser-mini",
    name: "Desk Riser Mini",
    tagline: "A little tilt goes a long way.",
    description:
      "A low-profile keyboard stand that adds a 6-degree typing angle " +
      "without the height of a full riser. Non-slip feet, cable channel " +
      "routed underneath.",
    category: "ACCESSORY",
    basePrice: 3200,
    specs: {
      Angle: "6 degrees",
      Material: "Solid oak or anodized aluminum",
      Feet: "Non-slip silicone",
    },
    isConfigurable: false,
    variants: [
      { sku: "DRM-OAK", name: "Oak", priceDelta: 0, attributes: { Material: "Oak" }, stock: 25 },
      { sku: "DRM-GRA", name: "Graphite Aluminum", priceDelta: 600, attributes: { Material: "Graphite Aluminum" }, stock: 40 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Group Buy / Drop
// ---------------------------------------------------------------------------
//
// The drop's linked Product is deliberately `status: "DRAFT"` and
// `category: "KEYCAP_SET"` - DRAFT keeps it out of `GET /api/products`
// (normal /shop listing) and any cart-by-slug path, by design: the drop
// route (`GET /api/drops/:slug`) fetches this Product directly by the
// drop's own `productId`, bypassing the `status: ACTIVE` filter every
// other product route applies. Do not flip this to ACTIVE "to make it show
// up in the shop" - that would let it be added to cart through the normal
// `POST /api/cart/items` path too, which has no reservation/oversell
// protection at all.
//
// The linked Variant's `stock` is intentionally 0 - drop inventory is
// tracked ENTIRELY by `GroupBuyDrop.totalStock`/`soldCount`/
// `DropReservation` rows, never `Variant.stock` (see schema.prisma's
// GroupBuyDrop doc comment). Don't "fix" this to a nonzero number thinking
// it's a forgotten field. This also means `seedSampleOrdersAndBuilds`'s
// line-item pool never needs to special-case excluding this product: its
// one variant's `stock: 0` already gets it skipped by the normal
// zero-stock-variant filter, for free.
//
// `openAt` is seeded in the PAST and `closeAt` a few days in the future so
// the drop is immediately LIVE for a reviewer clicking through the demo -
// landing on a dead "upcoming" page with nothing to interact with would be
// a bad first impression of the signature showpiece feature.
const dropSeed = {
  product: {
    slug: "aurora-reserve",
    name: "Aurora Reserve",
    tagline: "One run. No restock.",
    description:
      "A dye-sublimated PBT keycap set in a shifting teal-to-violet gradient, " +
      "cut for our house cylindrical profile with a glow-through legend set. " +
      "This colorway is a single, non-repeating production run tied to this " +
      "drop window. Once the reserve pool sells out, the mould retires for " +
      "good. Includes the full alpha/mod kit plus five gradient novelties.",
    category: "KEYCAP_SET" as ProductType,
    basePrice: 11400,
    specs: {
      Profile: "Cylindrical",
      Material: "PBT Dye-Sub",
      Kit: "Base + 5 novelties",
      Legends: "Shine-through, aurora gradient",
      Run: "Single batch, not restocked",
    },
  },
  variant: {
    sku: "AUR-RES-STD",
    name: "Standard Kit",
    priceDelta: 0,
    attributes: { Kit: "Standard" },
  },
  drop: {
    slug: "aurora-reserve",
    title: "Aurora Reserve Group Buy",
    description:
      "Reserve a set before the pool runs dry. Every unit here is hand-counted " +
      "against this run's mould yield. When the counter hits zero, it's gone " +
      "for good, not back-ordered.",
    openAtOffsetMs: -1000 * 60 * 60 * 24, // 1 day in the past -> immediately LIVE
    closeAtOffsetMs: 1000 * 60 * 60 * 24 * 4, // 4 days from now
    totalStock: 18,
  },
}

async function seedGroupBuyDrop(prisma: PrismaClient): Promise<void> {
  const d = dropSeed
  const now = Date.now()

  const product = await prisma.product.upsert({
    where: { slug: d.product.slug },
    update: {
      name: d.product.name,
      tagline: d.product.tagline,
      description: d.product.description,
      category: d.product.category,
      basePrice: d.product.basePrice,
      specs: d.product.specs,
      isConfigurable: false,
      status: "DRAFT",
    },
    create: {
      slug: d.product.slug,
      name: d.product.name,
      tagline: d.product.tagline,
      description: d.product.description,
      category: d.product.category,
      basePrice: d.product.basePrice,
      currency: "usd",
      images: [],
      specs: d.product.specs,
      isConfigurable: false,
      status: "DRAFT",
    },
  })

  const variant = await prisma.variant.upsert({
    where: { sku: d.variant.sku },
    update: {
      name: d.variant.name,
      priceDelta: d.variant.priceDelta,
      attributes: d.variant.attributes,
      stock: 0,
    },
    create: {
      productId: product.id,
      sku: d.variant.sku,
      name: d.variant.name,
      priceDelta: d.variant.priceDelta,
      attributes: d.variant.attributes,
      stock: 0,
    },
  })

  await prisma.groupBuyDrop.upsert({
    where: { slug: d.drop.slug },
    update: {
      productId: product.id,
      variantId: variant.id,
      title: d.drop.title,
      description: d.drop.description,
      openAt: new Date(now + d.drop.openAtOffsetMs),
      closeAt: new Date(now + d.drop.closeAtOffsetMs),
      totalStock: d.drop.totalStock,
    },
    create: {
      slug: d.drop.slug,
      productId: product.id,
      variantId: variant.id,
      title: d.drop.title,
      description: d.drop.description,
      openAt: new Date(now + d.drop.openAtOffsetMs),
      closeAt: new Date(now + d.drop.closeAtOffsetMs),
      totalStock: d.drop.totalStock,
      soldCount: 0,
    },
  })

  console.log(`seeded group buy drop ${d.drop.slug} (product ${product.slug}, variant ${variant.sku})`)
}

// One demo admin user, upserted by email (idempotent, same pattern as
// every product/variant/drop upsert above - safe to re-run, including via
// the "Reset demo data" admin button). Password is re-hashed on every run
// since this seed has no "only set password on create" branch; cheap
// enough at cost factor 12 for a seed script that runs rarely, and
// guarantees the login below always matches ADMIN_PASSWORD even if a human
// edits the constant later. Never touched by `wipeDemoData` - see this
// file's top-of-file doc comment.
async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const hashedPassword = await hash(ADMIN_PASSWORD, ADMIN_BCRYPT_ROUNDS)
  const admin = await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    update: {
      hashedPassword,
      displayName: "Demo Admin",
      role: "ADMIN",
    },
    create: {
      email: DEMO_ADMIN_EMAIL,
      hashedPassword,
      displayName: "Demo Admin",
      role: "ADMIN",
    },
  })
  console.log(`seeded admin user ${admin.email} (role ${admin.role})`)
}

// ---------------------------------------------------------------------------
// Wipe (reset-demo-data support)
// ---------------------------------------------------------------------------

/**
 * FK-respecting delete order - children before parents, matching the
 * no-`onDelete`-clause RESTRICT constraints documented in schema.prisma:
 *
 *   DropReservation -> CartItem -> Cart -> OrderItem -> Order -> SavedBuild
 *   -> CustomBuild -> GroupBuyDrop -> Variant -> Product
 *
 * `User` is never included here - see this file's top-of-file doc comment.
 * Safe to call against an empty DB (every `deleteMany` is then a no-op).
 */
async function wipeDemoData(prisma: PrismaClient): Promise<void> {
  await prisma.dropReservation.deleteMany({})
  await prisma.cartItem.deleteMany({})
  await prisma.cart.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.order.deleteMany({})
  await prisma.savedBuild.deleteMany({})
  await prisma.customBuild.deleteMany({})
  await prisma.groupBuyDrop.deleteMany({})
  await prisma.variant.deleteMany({})
  await prisma.product.deleteMany({})
}

// ---------------------------------------------------------------------------
// Sample Order/OrderItem/CustomBuild rows (admin dashboard demo data)
// ---------------------------------------------------------------------------

/**
 * Eight fixed-id `CustomBuild` rows, built only against products with a
 * real matching `BuildLayoutId` ("60"/"65"/"75"/"tkl" - `shared/src/
 * build.ts`): `anvil-65`(65) / `foundry-tkl`(tkl) / `bastion-75`(75) /
 * `monolith-60`(60) are exactly the four `isConfigurable: true` products
 * whose Layout spec matches a real `BuildLayoutId`. Deliberately not
 * `drift-96` - that product has `isConfigurable: true` but a `"96"`
 * layout, and `BuildLayoutIdSchema` has no `"96"` member (a real,
 * pre-existing contract gap - out of scope to fix here, just don't build
 * seed data on top of it).
 *
 * Option ids below are real `shared/src/options.ts` catalog entries, not
 * guessed from descriptive names. Only `caseMaterial`/`caseColor`/
 * `switches`/`keycaps` are set per build - `plate`/`stabilizers`/`cable`/
 * `artisanKeycap`/`caseFinish` are left unset (a valid, "not yet decided"
 * partial selection, same as a live mid-configuration build). Checked
 * against every rule in `shared/src/compatibility.ts` by hand: none of
 * these 8 combinations violate anodized/frosted/walnut-finish/
 * walnut-color/midnight-spherical-layout/silent-foam/frost-cable rules.
 */
interface CustomBuildDef {
  id: string
  productSlug: string
  layout: BuildLayoutId
  selections: Partial<Record<BuildSlot, string>>
}

const CUSTOM_BUILD_DEFS: CustomBuildDef[] = [
  {
    id: "seed-build-01",
    productSlug: "anvil-65",
    layout: "65",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-graphite",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-standard",
    },
  },
  {
    id: "seed-build-02",
    productSlug: "anvil-65",
    layout: "65",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-forge-amber",
      switches: "switch-hearth-tactile",
      keycaps: "keycap-quarry-standard",
    },
  },
  {
    id: "seed-build-03",
    productSlug: "foundry-tkl",
    layout: "tkl",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-frost-white",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-standard",
    },
  },
  {
    id: "seed-build-04",
    productSlug: "anvil-65",
    layout: "65",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-graphite",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-standard",
    },
  },
  {
    id: "seed-build-05",
    productSlug: "bastion-75",
    layout: "75",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-graphite",
      switches: "switch-riot-clicky",
      keycaps: "keycap-quarry-full",
    },
  },
  {
    id: "seed-build-06",
    productSlug: "monolith-60",
    layout: "60",
    selections: {
      caseMaterial: "case-mat-walnut",
      caseColor: "case-col-natural-walnut",
      switches: "switch-slimline-linear",
      keycaps: "keycap-midnight-spherical",
    },
  },
  {
    id: "seed-build-07",
    productSlug: "foundry-tkl",
    layout: "tkl",
    selections: {
      caseMaterial: "case-mat-polycarbonate",
      caseColor: "case-col-switch-cyan",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-full",
    },
  },
  {
    id: "seed-build-08",
    productSlug: "anvil-65",
    layout: "65",
    selections: {
      caseMaterial: "case-mat-aluminum",
      caseColor: "case-col-graphite",
      switches: "switch-ember-linear",
      keycaps: "keycap-signal-standard",
    },
  },
]

/**
 * 24 orders, deterministic `orderNumber`s `CF-SEED-0001`..`CF-SEED-0024`
 * (array index + 1), oldest-first. `daysAgo` is resolved against "now" at
 * seed-run time (same relative-date convention as `dropSeed`'s
 * `openAtOffsetMs`/`closeAtOffsetMs` above) - never a fixed historical
 * date, so every order always lands inside the dashboard's trailing 30-day
 * window no matter when this seed runs.
 */
interface OrderBucket {
  status: "DELIVERED" | "SHIPPED" | "BUILDING" | "PLACED"
  daysAgo: number
}

const ORDER_STATUS_BUCKETS: OrderBucket[] = [
  // DELIVERED: 7 orders, daysAgo 15-21, one per day.
  { status: "DELIVERED", daysAgo: 21 },
  { status: "DELIVERED", daysAgo: 20 },
  { status: "DELIVERED", daysAgo: 19 },
  { status: "DELIVERED", daysAgo: 18 },
  { status: "DELIVERED", daysAgo: 17 },
  { status: "DELIVERED", daysAgo: 16 },
  { status: "DELIVERED", daysAgo: 15 },
  // SHIPPED: 6 orders, daysAgo 9-14, one per day.
  { status: "SHIPPED", daysAgo: 14 },
  { status: "SHIPPED", daysAgo: 13 },
  { status: "SHIPPED", daysAgo: 12 },
  { status: "SHIPPED", daysAgo: 11 },
  { status: "SHIPPED", daysAgo: 10 },
  { status: "SHIPPED", daysAgo: 9 },
  // BUILDING: 6 orders, daysAgo 4-8; day 4 gets 2 orders.
  { status: "BUILDING", daysAgo: 8 },
  { status: "BUILDING", daysAgo: 7 },
  { status: "BUILDING", daysAgo: 6 },
  { status: "BUILDING", daysAgo: 5 },
  { status: "BUILDING", daysAgo: 4 },
  { status: "BUILDING", daysAgo: 4 },
  // PLACED: 5 orders, daysAgo 0-3; day 0 gets 2 orders.
  { status: "PLACED", daysAgo: 3 },
  { status: "PLACED", daysAgo: 2 },
  { status: "PLACED", daysAgo: 1 },
  { status: "PLACED", daysAgo: 0 },
  { status: "PLACED", daysAgo: 0 },
]

/**
 * 1-based order index -> `CustomBuildDef.id`. Spread deliberately across
 * all four status buckets (2 orders per bucket) so the admin dashboard's
 * top-options chart has real signal in every pipeline stage, not just
 * "recent" orders.
 */
const CUSTOM_BUILD_ORDER_MAP: Record<number, string> = {
  2: "seed-build-01",
  5: "seed-build-02",
  8: "seed-build-03",
  11: "seed-build-04",
  14: "seed-build-05",
  17: "seed-build-06",
  20: "seed-build-07",
  23: "seed-build-08",
}

interface LineItemCandidate {
  productId: string
  variantId?: string
  name: string
  unitPrice: number
}

/**
 * Real, computed (not hand-typed) catalog line-item pool - queries the
 * just-reseeded `Product`/`Variant` rows directly rather than re-deriving
 * prices from the `products` array above, so a future edit to that array
 * can never silently drift out of sync with what sample orders actually
 * charge.
 *
 * Skips every variant with `stock: 0` (`BAS75-ONX`/`MNL60-GRA`/`FCC-AMB`
 * are the three zero-stock variants whose sibling variant is still in
 * stock; `SNDR-TKL-BLK`/`GLC-LIN-*`/`MDN-STD` are each their fully
 * out-of-stock product's only variant(s), so those three products
 * contribute nothing to the pool at all once the zero-stock filter runs -
 * no separate product-level exclusion needed). Only `ACTIVE` products are
 * queried, which also naturally excludes the group-buy drop's own `DRAFT`
 * product (`aurora-reserve`) without any special-casing.
 */
async function buildLineItemPool(prisma: PrismaClient): Promise<LineItemCandidate[]> {
  const dbProducts = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      category: { in: ["KIT", "SWITCH", "KEYCAP_SET", "ACCESSORY"] },
    },
    include: { variants: true },
  })

  const pool: LineItemCandidate[] = []
  for (const product of dbProducts) {
    if (product.variants.length === 0) {
      // Zero-variant product - priced off basePrice alone (same pattern as
      // options.ts's catalogRef note for e.g. stabilizer-tuning-kit).
      pool.push({ productId: product.id, name: product.name, unitPrice: product.basePrice })
      continue
    }
    for (const variant of product.variants) {
      if (variant.stock === 0) continue
      pool.push({
        productId: product.id,
        variantId: variant.id,
        name: `${product.name} (${variant.name})`,
        unitPrice: product.basePrice + variant.priceDelta,
      })
    }
  }
  return pool
}

/**
 * Creates the 8 `CustomBuild` rows, then the 24 `Order`+`OrderItem` rows.
 * `subtotal`/`tax`/`shipping`/`total` are computed for EVERY order via the
 * real `calculateCartTotals` (`shared/src/cart.ts`) - never hand-rolled -
 * and every `CustomBuild.totalPrice` via the real `calculatePrice`
 * (`shared/src/pricing.ts`), same "never trust/invent a price" rule this
 * app applies to live checkout.
 */
async function seedSampleOrdersAndBuilds(prisma: PrismaClient): Promise<void> {
  const pool = await buildLineItemPool(prisma)
  if (pool.length === 0) {
    throw new Error("seed: no eligible in-stock catalog rows to build sample orders from")
  }

  const buildRows = new Map<string, { productId: string; totalPrice: number; name: string }>()

  for (const def of CUSTOM_BUILD_DEFS) {
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: def.productSlug } })

    const config: BuildConfig = {
      version: CURRENT_BUILD_CONFIG_VERSION,
      productId: product.id,
      layout: def.layout,
      selections: def.selections,
      accentKeys: {},
      totalPrice: 0, // never trusted - recomputed by calculatePrice below
    }

    const priceResult = calculatePrice(config, DEFAULT_CATALOG, { productId: product.id, priceCents: product.basePrice })
    if (!priceResult.ok) {
      throw new Error(`seed build ${def.id} failed to price: ${priceResult.error.code}: ${priceResult.error.message}`)
    }

    const name = `${product.name} Custom Build`
    await prisma.customBuild.upsert({
      where: { id: def.id },
      update: {
        userId: null,
        productId: product.id,
        layout: def.layout,
        selections: def.selections,
        accentKeys: {},
        configVersion: CURRENT_BUILD_CONFIG_VERSION,
        totalPrice: priceResult.subtotal,
        name,
      },
      create: {
        id: def.id,
        userId: null,
        productId: product.id,
        layout: def.layout,
        selections: def.selections,
        accentKeys: {},
        configVersion: CURRENT_BUILD_CONFIG_VERSION,
        totalPrice: priceResult.subtotal,
        name,
      },
    })

    buildRows.set(def.id, { productId: product.id, totalPrice: priceResult.subtotal, name })
  }

  const now = Date.now()
  let poolCursor = 0
  let nonCustomCounter = 0

  for (let i = 0; i < ORDER_STATUS_BUCKETS.length; i++) {
    const orderIndex = i + 1
    const bucket = ORDER_STATUS_BUCKETS[i]!
    const orderNumber = `CF-SEED-${String(orderIndex).padStart(4, "0")}`
    const placedAt = new Date(now - bucket.daysAgo * 24 * 60 * 60 * 1000)

    const snapshots: CartItemSnapshot[] = []
    const customBuildDefId = CUSTOM_BUILD_ORDER_MAP[orderIndex]

    if (customBuildDefId !== undefined) {
      const build = buildRows.get(customBuildDefId)
      if (!build) throw new Error(`seed: missing build row for ${customBuildDefId}`)

      snapshots.push({
        id: `seed-line-${orderIndex}-build`,
        productId: build.productId,
        customBuildId: customBuildDefId,
        name: build.name,
        quantity: 1,
        unitPrice: build.totalPrice,
        lineTotal: build.totalPrice,
      })

      const extra = pool[poolCursor % pool.length]!
      poolCursor++
      snapshots.push({
        id: `seed-line-${orderIndex}-extra`,
        productId: extra.productId,
        variantId: extra.variantId,
        name: extra.name,
        quantity: 1,
        unitPrice: extra.unitPrice,
        lineTotal: extra.unitPrice,
      })
    } else {
      const itemCount = [1, 2, 3][nonCustomCounter % 3]!
      nonCustomCounter++
      for (let k = 0; k < itemCount; k++) {
        const item = pool[poolCursor % pool.length]!
        poolCursor++
        snapshots.push({
          id: `seed-line-${orderIndex}-${k}`,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          quantity: 1,
          unitPrice: item.unitPrice,
          lineTotal: item.unitPrice,
        })
      }
    }

    const totals = calculateCartTotals(snapshots)
    const total = totals.subtotal + totals.estimatedShipping + totals.estimatedTax

    const order = await prisma.order.upsert({
      where: { orderNumber },
      update: {
        status: bucket.status,
        subtotal: totals.subtotal,
        tax: totals.estimatedTax,
        shipping: totals.estimatedShipping,
        total,
        placedAt,
      },
      create: {
        orderNumber,
        status: bucket.status,
        subtotal: totals.subtotal,
        tax: totals.estimatedTax,
        shipping: totals.estimatedShipping,
        total,
        placedAt,
      },
    })

    // Defensive idempotency (normally a no-op: `wipeDemoData` already
    // cleared every Order/OrderItem before this function runs inside
    // `seedAll`) - keeps this function independently safe to re-call.
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } })

    for (const snap of snapshots) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: snap.productId,
          variantId: snap.variantId,
          customBuildId: snap.customBuildId,
          name: snap.name,
          unitPrice: snap.unitPrice,
          quantity: snap.quantity,
          lineTotal: snap.lineTotal,
        },
      })
    }
  }

  console.log(`seeded ${CUSTOM_BUILD_DEFS.length} custom builds and ${ORDER_STATUS_BUCKETS.length} sample orders`)
}

// ---------------------------------------------------------------------------
// seedAll entry point (see this file's top-of-file doc comment)
// ---------------------------------------------------------------------------

export async function seedAll(prisma: PrismaClient): Promise<SeedCounts> {
  await wipeDemoData(prisma)

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        category: p.category,
        basePrice: p.basePrice,
        specs: p.specs,
        isConfigurable: p.isConfigurable,
      },
      create: {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        category: p.category,
        basePrice: p.basePrice,
        currency: "usd",
        images: [],
        specs: p.specs,
        isConfigurable: p.isConfigurable,
      },
    })

    for (const v of p.variants) {
      await prisma.variant.upsert({
        where: { sku: v.sku },
        update: {
          name: v.name,
          priceDelta: v.priceDelta,
          attributes: v.attributes,
          stock: v.stock,
        },
        create: {
          productId: product.id,
          sku: v.sku,
          name: v.name,
          priceDelta: v.priceDelta,
          attributes: v.attributes,
          stock: v.stock,
        },
      })
    }

    console.log(`seeded ${product.slug} (+${p.variants.length} variants)`)
  }

  // openAt/closeAt are recomputed relative to "now" on every re-run (not
  // fixed timestamps) - deliberate, so the drop is always immediately live
  // with ~4 days left whenever this seed runs, including via the "Reset
  // demo data" admin button. A fixed historical date would eventually
  // drift the demo into a stale "closed" state.
  await seedGroupBuyDrop(prisma)
  await seedAdminUser(prisma)
  await seedSampleOrdersAndBuilds(prisma)

  const [productsCount, variantsCount, ordersCount, customBuildsCount, groupBuyDropsCount] = await Promise.all([
    prisma.product.count(),
    prisma.variant.count(),
    prisma.order.count(),
    prisma.customBuild.count(),
    prisma.groupBuyDrop.count(),
  ])

  return {
    products: productsCount,
    variants: variantsCount,
    orders: ordersCount,
    customBuilds: customBuildsCount,
    groupBuyDrops: groupBuyDropsCount,
  }
}

// ---------------------------------------------------------------------------
// CLI entry point - ONLY runs when this file is executed directly
// (`npm run prisma:seed` / `prisma db seed`, both resolve to
// `tsx prisma/seed.ts`). Guarded so importing `seedAll` from the
// `POST /api/admin/reset-demo-data` route never re-triggers this block at
// server boot or at import time - see top-of-file doc comment.
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const cliPrisma = new PrismaClient()
  seedAll(cliPrisma)
    .then((counts) => {
      console.log("seed complete:", counts)
    })
    .catch((err: unknown) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => {
      void cliPrisma.$disconnect()
    })
}
