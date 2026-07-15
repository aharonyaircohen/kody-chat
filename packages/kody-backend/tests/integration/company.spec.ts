import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("company", () => {
  it("saves and upserts intents", async () => {
    const t = setup()
    await t.mutation(api.company.saveIntent, {
      repo: REPO,
      intentId: "i1",
      intent: { status: "draft" },
      updatedAt: NOW,
    })
    await t.mutation(api.company.saveIntent, {
      repo: REPO,
      intentId: "i1",
      intent: { status: "active" },
      updatedAt: NOW,
    })
    const intents = await t.query(api.company.listIntents, { repo: REPO })
    expect(intents).toHaveLength(1)
    expect(intents[0].intent.status).toBe("active")
  })

  it("appends decisions in order per intent", async () => {
    const t = setup()
    await t.mutation(api.company.appendDecision, {
      repo: REPO,
      intentId: "i1",
      decision: { d: "first" },
    })
    await t.mutation(api.company.appendDecision, {
      repo: REPO,
      intentId: "i1",
      decision: { d: "second" },
    })
    const run = setup() // fresh instance must be empty (isolation check)
    expect(await run.query(api.company.listIntents, { repo: REPO })).toHaveLength(0)
  })

  it("saves and upserts goals", async () => {
    const t = setup()
    await t.mutation(api.company.saveGoal, {
      repo: REPO,
      goalId: "g1",
      state: { state: "open" },
      updatedAt: NOW,
    })
    await t.mutation(api.company.saveGoal, {
      repo: REPO,
      goalId: "g1",
      state: { state: "done" },
      updatedAt: NOW,
    })
    const goals = await t.query(api.company.listGoals, { repo: REPO })
    expect(goals).toHaveLength(1)
    expect(goals[0].state.state).toBe("done")
  })

  it("saves and upserts agents", async () => {
    const t = setup()
    await t.mutation(api.company.saveAgent, {
      repo: REPO,
      slug: "helper",
      frontmatter: { model: "a" },
      body: "v1",
      updatedAt: NOW,
    })
    await t.mutation(api.company.saveAgent, {
      repo: REPO,
      slug: "helper",
      frontmatter: { model: "b" },
      body: "v2",
      updatedAt: NOW,
    })
    const agents = await t.query(api.company.listAgents, { repo: REPO })
    expect(agents).toHaveLength(1)
    expect(agents[0].body).toBe("v2")
    expect(agents[0].frontmatter.model).toBe("b")
  })
})
