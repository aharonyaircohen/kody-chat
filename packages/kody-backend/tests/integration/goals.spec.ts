import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("goals", () => {
  it("saves and upserts goals", async () => {
    const t = setup()
    await t.mutation(api.goals.save, {
      tenantId: TENANT,
      goalId: "g1",
      state: { state: "open" },
      updatedAt: NOW,
    })
    await t.mutation(api.goals.save, {
      tenantId: TENANT,
      goalId: "g1",
      state: { state: "done" },
      updatedAt: NOW,
    })
    const goals = await t.query(api.goals.list, { tenantId: TENANT })
    expect(goals).toHaveLength(1)
    expect(goals[0].state.state).toBe("done")
  })

  it("scopes goals to their tenant", async () => {
    const t = setup()
    await t.mutation(api.goals.save, {
      tenantId: TENANT,
      goalId: "g1",
      state: {},
      updatedAt: NOW,
    })
    expect(await t.query(api.goals.list, { tenantId: "other/tenant" })).toHaveLength(0)
  })
})
