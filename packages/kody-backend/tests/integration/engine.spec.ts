import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const NOW = "2026-07-15T00:00:00.000Z"

describe("engine", () => {
  it("saves and upserts action state per run", async () => {
    const t = setup()
    await t.mutation(api.engine.saveActionState, {
      runId: "run1",
      state: { status: "running" },
      updatedAt: NOW,
    })
    await t.mutation(api.engine.saveActionState, {
      runId: "run1",
      state: { status: "done" },
      updatedAt: NOW,
    })
    const state = await t.query(api.engine.getActionState, { runId: "run1" })
    expect(state?.state.status).toBe("done")
    expect(await t.query(api.engine.getActionState, { runId: "nope" })).toBeNull()
  })

  it("appends events and filters by run", async () => {
    const t = setup()
    for (const [i, runId] of [
      [1, "a"],
      [2, "b"],
      [3, "a"],
    ] as const) {
      await t.mutation(api.engine.appendEvent, {
        entryId: `e${i}`,
        runId,
        event: "step",
        payload: { i },
        emittedAt: `2026-07-15T00:00:0${i}.000Z`,
      })
    }
    const forA = await t.query(api.engine.eventsForRun, { runId: "a" })
    expect(forA.map((e) => e.entryId)).toEqual(["e1", "e3"])
  })

  it("returns recent events newest-first with a bounded limit", async () => {
    const t = setup()
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.engine.appendEvent, {
        entryId: `e${i}`,
        runId: "r",
        event: "tick",
        payload: {},
        emittedAt: `2026-07-15T00:00:0${i}.000Z`,
      })
    }
    const recent = await t.query(api.engine.recentEvents, { limit: 3 })
    expect(recent).toHaveLength(3)
    expect(recent[0].entryId).toBe("e4")
  })
})
