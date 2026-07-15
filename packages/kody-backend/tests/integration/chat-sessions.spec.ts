import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("chatSessions", () => {
  it("upserts sessions and lists them per tenant", async () => {
    const t = setup()
    await t.mutation(api.chatSessions.upsert, {
      tenantId: TENANT,
      sessionId: "s1",
      meta: { title: "First" },
      updatedAt: NOW,
    })
    await t.mutation(api.chatSessions.upsert, {
      tenantId: TENANT,
      sessionId: "s1",
      meta: { title: "Renamed" },
      updatedAt: NOW,
    })
    await t.mutation(api.chatSessions.upsert, {
      tenantId: "other/tenant",
      sessionId: "s9",
      meta: {},
      updatedAt: NOW,
    })

    const sessions = await t.query(api.chatSessions.list, { tenantId: TENANT })
    expect(sessions).toHaveLength(1)
    expect(sessions[0].meta.title).toBe("Renamed")
  })

  it("returns null for a missing session", async () => {
    const t = setup()
    expect(await t.query(api.chatSessions.get, { tenantId: TENANT, sessionId: "nope" })).toBeNull()
  })
})
