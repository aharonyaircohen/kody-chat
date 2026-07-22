import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { NOW, validDecision, validIntent } from "../fixtures"
import { setup } from "./helpers"

const TENANT = "acme/app"

describe("intents", () => {
  it("saves and upserts intents", async () => {
    const t = setup()
    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "i1",
      intent: validIntent({ status: "paused" }),
      updatedAt: NOW,
    })
    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "i1",
      intent: validIntent({ status: "active" }),
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
      decision: validDecision({ reason: "first" }),
    })
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "i1",
      decision: validDecision({ reason: "second" }),
    })
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "other",
      decision: validDecision({ reason: "elsewhere" }),
    })

    const decisions = await t.query(api.intents.listDecisions, {
      tenantId: TENANT,
      intentId: "i1",
    })
    expect(decisions.map((d) => d.seq)).toEqual([0, 1])
    expect(decisions.map((d) => d.decision.reason)).toEqual(["first", "second"])
  })
})

describe("intents schema enforcement", () => {
  it("accepts reusable policy references with enforced controls", async () => {
    const t = setup()
    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "i1",
      intent: validIntent({ policyRefs: ["release-safety"] }),
      updatedAt: NOW,
    })
    const intent = await t.query(api.intents.get, {
      tenantId: TENANT,
      intentId: "i1",
    })
    expect(intent?.intent.policyRefs).toEqual(["release-safety"])
  })

  it("rejects an intent with an invalid status", async () => {
    const t = setup()
    await expect(
      t.mutation(api.intents.save, {
        tenantId: TENANT,
        intentId: "bad",
        intent: validIntent({ status: "draft" }),
        updatedAt: NOW,
      }),
    ).rejects.toThrow()
  })

  it("rejects a decision missing its reason", async () => {
    const t = setup()
    const { reason: _reason, ...decision } = validDecision()
    await expect(
      t.mutation(api.intents.appendDecision, {
        tenantId: TENANT,
        intentId: "i1",
        decision,
      }),
    ).rejects.toThrow()
  })
})
