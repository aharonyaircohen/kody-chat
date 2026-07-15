import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("chatTurns", () => {
  it("appends turns with increasing seq and returns them with the session", async () => {
    const t = setup()
    await t.mutation(api.chatSessions.upsert, {
      tenantId: TENANT,
      sessionId: "s1",
      meta: {},
      updatedAt: NOW,
    })
    await t.mutation(api.chatTurns.append, {
      tenantId: TENANT,
      sessionId: "s1",
      turn: { role: "user", content: "hi" },
    })
    await t.mutation(api.chatTurns.append, {
      tenantId: TENANT,
      sessionId: "s1",
      turn: { role: "assistant", content: "hello" },
    })

    const result = await t.query(api.chatSessions.get, { tenantId: TENANT, sessionId: "s1" })
    expect(result?.turns.map((x) => x.seq)).toEqual([0, 1])
    expect(result?.turns[1].turn.content).toBe("hello")
  })

  it("lists turns for a session in seq order", async () => {
    const t = setup()
    await t.mutation(api.chatTurns.append, {
      tenantId: TENANT,
      sessionId: "s1",
      turn: { role: "user", content: "a" },
    })
    await t.mutation(api.chatTurns.append, {
      tenantId: TENANT,
      sessionId: "s1",
      turn: { role: "assistant", content: "b" },
    })
    const turns = await t.query(api.chatTurns.list, { tenantId: TENANT, sessionId: "s1" })
    expect(turns.map((x) => x.turn.content)).toEqual(["a", "b"])
  })
})
