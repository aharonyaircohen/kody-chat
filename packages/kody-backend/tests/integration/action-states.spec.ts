import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const NOW = "2026-07-15T00:00:00.000Z"

describe("actionStates", () => {
  it("saves and upserts action state per run", async () => {
    const t = setup()
    await t.mutation(api.actionStates.save, {
      runId: "run1",
      state: { status: "running" },
      updatedAt: NOW,
    })
    await t.mutation(api.actionStates.save, {
      runId: "run1",
      state: { status: "done" },
      updatedAt: NOW,
    })
    const state = await t.query(api.actionStates.get, { runId: "run1" })
    expect(state?.state.status).toBe("done")
  })

  it("returns null for an unknown run", async () => {
    const t = setup()
    expect(await t.query(api.actionStates.get, { runId: "nope" })).toBeNull()
  })
})
