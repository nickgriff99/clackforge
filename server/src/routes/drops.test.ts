import { ApiErrorSchema, ReserveDropResponseSchema } from "@shared"
import type { GroupBuyDrop, Product, User, Variant } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../app"
import { prisma } from "../db/prisma"
import { computeAvailableStock } from "../lib/drops"

/**
 * This file's name (`drops.test.ts`) matches both the default
 * `vitest.config.ts`'s built-in test glob (`**\/*.test.ts` - that config
 * sets no `include` override) and `vitest.integration.config.ts`'s
 * explicit `include`. `vitest.config.ts` deliberately stays DB-free for
 * health.test.ts/CI, so a plain `npm test` would otherwise discover this
 * file too and try to run it against that config's dummy `DATABASE_URL`,
 * breaking the DB-free CI guarantee with real connection failures.
 * Guarded with a self-skip instead of an exclude-pattern edit to
 * vitest.config.ts: this whole suite only actually executes when
 * `CLACKFORGE_RUN_DROP_INTEGRATION=1` is set, which only
 * `vitest.integration.config.ts` sets (see its `test.env`). Under a plain
 * `npm test` run, this file is still collected but every test inside
 * reports "skipped," never touches Postgres.
 */
const RUNNING_INTEGRATION_SUITE = process.env.CLACKFORGE_RUN_DROP_INTEGRATION === "1"

const RUN_ID = Date.now()
const RESERVE_PATH = (slug: string) => `/api/drops/${slug}/reserve`

describe.skipIf(!RUNNING_INTEGRATION_SUITE)("POST /api/drops/:slug/reserve - oversell race (real Postgres)", () => {
  const app = createApp()

  let product: Product
  let variant: Variant
  let drop: GroupBuyDrop
  let users: User[]
  let agents: ReturnType<typeof request.agent>[] = []

  const dropSlug = `race-test-${RUN_ID}`

  beforeAll(async () => {
    product = await prisma.product.create({
      data: {
        slug: `race-test-product-${RUN_ID}`,
        name: "Race Test Keycap Set",
        tagline: "Integration-test fixture, not a real product.",
        description: "Created by drops.test.ts's race-condition suite - deleted in afterAll.",
        category: "KEYCAP_SET",
        basePrice: 1000,
        specs: {},
        isConfigurable: false,
        status: "DRAFT",
      },
    })

    variant = await prisma.variant.create({
      data: {
        productId: product.id,
        sku: `RACE-TEST-${RUN_ID}`,
        name: "Standard",
        priceDelta: 0,
        attributes: {},
        stock: 0,
      },
    })

    // totalStock: 1 - the whole point: exactly one of 5 concurrent reserve
    // attempts for this last unit may succeed.
    drop = await prisma.groupBuyDrop.create({
      data: {
        slug: dropSlug,
        productId: product.id,
        variantId: variant.id,
        title: "Race Test Drop",
        description: "Integration-test fixture.",
        openAt: new Date(Date.now() - 1000 * 60 * 60),
        closeAt: new Date(Date.now() + 1000 * 60 * 60),
        totalStock: 1,
        soldCount: 0,
      },
    })

    // Real register flow (not hand-seeded sessions) - exercises the actual
    // auth middleware chain the reserve route sits behind, not a shortcut.
    const registered = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        const agent = request.agent(app)
        const email = `race-test-user-${RUN_ID}-${i}@example.com`
        const res = await agent
          .post("/api/auth/register")
          .send({ email, password: "correct-horse-battery-staple", displayName: `Racer ${i}` })
        if (res.status !== 201) {
          throw new Error(`fixture setup failed: register returned ${res.status}: ${JSON.stringify(res.body)}`)
        }
        return { agent, email }
      }),
    )
    users = await prisma.user.findMany({ where: { email: { in: registered.map((r) => r.email) } } })
    agents = registered.map((r) => r.agent)
  })

  afterAll(async () => {
    // Order matters for FK constraints: GroupBuyDrop cascades
    // DropReservation (onDelete: Cascade), so deleting it first clears every
    // reservation regardless of its cartItemId state. Deleting Users next
    // cascades Cart -> CartItem (also onDelete: Cascade both hops). Only
    // then can Variant/Product be deleted without hitting the CartItem ->
    // Product/Variant FK (no cascade on that side, by design - see
    // schema.prisma).
    await prisma.groupBuyDrop.deleteMany({ where: { id: drop?.id } })
    await prisma.user.deleteMany({ where: { id: { in: (users ?? []).map((u) => u.id) } } })
    await prisma.variant.deleteMany({ where: { id: variant?.id } })
    await prisma.product.deleteMany({ where: { id: product?.id } })
    await prisma.$disconnect()
  })

  it("lets exactly one of 5 concurrent reservations win the last unit", async () => {
    const responses = await Promise.all(agents.map((agent) => agent.post(RESERVE_PATH(dropSlug)).send({ quantity: 1 })))

    // Asserting 200, not 201 (see shared/src/groupBuyDrop.ts's doc comment
    // above ReserveDropResponseSchema): this route updates an existing
    // cart/reservation pairing as often as it creates one, so "200 OK"
    // reads more accurately than "201 Created."
    const successes = responses.filter((r) => r.status === 200)
    const soldOut = responses.filter((r) => r.status === 409)

    expect(successes).toHaveLength(1)
    expect(soldOut).toHaveLength(4)

    for (const res of successes) {
      expect(() => ReserveDropResponseSchema.parse(res.body)).not.toThrow()
    }
    for (const res of soldOut) {
      expect(() => ApiErrorSchema.parse(res.body)).not.toThrow()
      expect(res.body.error.code).toBe("SOLD_OUT")
    }

    // Direct DB assertions - don't just trust the HTTP responses.
    const activeReservations = await prisma.dropReservation.findMany({
      where: { dropId: drop.id, status: "ACTIVE" },
    })
    expect(activeReservations).toHaveLength(1)

    const totalReservedQuantity = activeReservations.reduce((sum, r) => sum + r.quantity, 0)
    expect(totalReservedQuantity).toBe(1)

    const freshDrop = await prisma.groupBuyDrop.findUniqueOrThrow({ where: { id: drop.id } })
    const availableStock = await computeAvailableStock(prisma, freshDrop)
    expect(availableStock).toBe(0)

    // Cross-check via the actual public route too, not just the internal helper.
    const stateRes = await request(app).get(`/api/drops/${dropSlug}`)
    expect(stateRes.status).toBe(200)
    expect(stateRes.body.availableStock).toBe(0)
    expect(stateRes.body.status).toBe("sold_out")
  })
})
