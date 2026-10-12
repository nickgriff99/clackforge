import { HealthResponseSchema } from "@shared"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../app"

/**
 * GET /health is the one route with zero DB/session dependency, so this
 * runs in CI without a Postgres service container. Product-route and
 * session-cookie coverage need a real database - see the integration test
 * suite for that.
 */
describe("GET /health", () => {
  it("returns a well-formed health response", async () => {
    const app = createApp()
    const res = await request(app).get("/health")

    expect(res.status).toBe(200)
    expect(() => HealthResponseSchema.parse(res.body)).not.toThrow()
    expect(res.body.status).toBe("ok")
  })

  it("does not set a session cookie (no DB dependency)", async () => {
    const app = createApp()
    const res = await request(app).get("/health")

    expect(res.headers["set-cookie"]).toBeUndefined()
  })
})
