import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../app"

// None of these routes touch the DB or session store: the guards under test
// run before session middleware, so no Postgres is needed.
describe("security middleware", () => {
  const app = createApp()

  it("sets hardening headers on every response", async () => {
    const res = await request(app).get("/health")

    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["strict-transport-security"]).toBeDefined()
    expect(res.headers["x-powered-by"]).toBeUndefined()
  })

  it("rejects a state-changing request from an untrusted origin", async () => {
    const res = await request(app).post("/api/auth/logout").set("Origin", "https://evil.example")

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED")
  })

  it("allows a state-changing request from the configured client origin", async () => {
    const res = await request(app).post("/api/does-not-exist").set("Origin", "http://localhost:5173")

    expect(res.status).toBe(404)
  })

  it("allows requests with no Origin header (curl, server-to-server)", async () => {
    const res = await request(app).post("/api/does-not-exist")

    expect(res.status).toBe(404)
  })

  it("does not apply the origin check to safe methods", async () => {
    const res = await request(app).get("/api/does-not-exist").set("Origin", "https://evil.example")

    expect(res.status).not.toBe(403)
  })
})
