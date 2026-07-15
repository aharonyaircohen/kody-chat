import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("intents", () => {
  it("saves and upserts intents", async () => {
    const t = setup()
    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "i1",
      intent: { status: "draft" },
      updatedAt: NOW,
    })
    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "i1",
      intent: { status: "active" },
      updatedAt: NOW,
    })
    const intents = await t.query(api.intents.list, { tenantId: TENANT })
    expect(intents).toHaveLength(1)
    expect(intents[0].intent.status).toBe("active")
  })

  it("appends and lists decisions in order per intent", async () => {
    const t = setup()
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "i1",
      decision: { d: "first" },
    })
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "i1",
      decision: { d: "second" },
    })
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "other",
      decision: { d: "elsewhere" },
    })

    const decisions = await t.query(api.intents.listDecisions, {
      tenantId: TENANT,
      intentId: "i1",
    })
    expect(decisions.map((d) => d.seq)).toEqual([0, 1])
    expect(decisions.map((d) => d.decision.d)).toEqual(["first", "second"])
  })
})
