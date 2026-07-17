import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"

describe("agencyRuns", () => {
  it("upserts a run and lists the newest runs first", async () => {
    const t = setup()
    await t.mutation(api.agencyRuns.save, {
      tenantId: TENANT,
      runId: "run-1",
      subjectType: "goal",
      subjectId: "goal-1",
      run: { status: "running" },
      updatedAt: "2026-07-17T10:00:00.000Z",
    })
    await t.mutation(api.agencyRuns.save, {
      tenantId: TENANT,
      runId: "run-2",
      subjectType: "workflow",
      subjectId: "release",
      run: { status: "completed" },
      updatedAt: "2026-07-17T11:00:00.000Z",
    })
    await t.mutation(api.agencyRuns.save, {
      tenantId: TENANT,
      runId: "run-1",
      subjectType: "goal",
      subjectId: "goal-1",
      run: { status: "completed" },
      updatedAt: "2026-07-17T12:00:00.000Z",
    })

    const runs = await t.query(api.agencyRuns.list, { tenantId: TENANT, limit: 10 })
    expect(runs).toHaveLength(2)
    expect(runs[0]?.runId).toBe("run-1")
    expect(runs[0]?.run).toEqual({ status: "completed" })
  })
})

describe("runEvents", () => {
  it("appends ordered events and supports run and goal reads", async () => {
    const t = setup()
    for (const type of ["run.started", "run.completed"]) {
      await t.mutation(api.runEvents.append, {
        tenantId: TENANT,
        runId: "run-1",
        goalId: "goal-1",
        event: { type },
        time: `2026-07-17T10:00:0${type === "run.started" ? "0" : "1"}.000Z`,
      })
    }

    const byRun = await t.query(api.runEvents.listByRun, {
      tenantId: TENANT,
      runId: "run-1",
    })
    expect(byRun.map((row) => row.seq)).toEqual([0, 1])

    const byGoal = await t.query(api.runEvents.listByGoal, {
      tenantId: TENANT,
      goalId: "goal-1",
      limit: 10,
    })
    expect(byGoal.map((row) => row.event.type)).toEqual(["run.completed", "run.started"])
  })
})
