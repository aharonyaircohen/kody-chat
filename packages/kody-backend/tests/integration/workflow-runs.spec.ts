import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("workflowRuns", () => {
  it("saves, upserts, and lists runs per workflow", async () => {
    const t = setup()
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      runId: "r1",
      state: { status: "running", completedStepIds: [] },
      updatedAt: NOW,
    })
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      runId: "r1",
      state: { status: "done", completedStepIds: ["a"] },
      updatedAt: NOW,
    })
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "other",
      runId: "r9",
      state: { status: "running" },
      updatedAt: NOW,
    })

    const runs = await t.query(api.workflowRuns.list, { tenantId: TENANT, workflowId: "deploy" })
    expect(runs).toHaveLength(1)
    expect(runs[0].state.status).toBe("done")
  })

  it("gets a single run and returns null when missing", async () => {
    const t = setup()
    expect(
      await t.query(api.workflowRuns.get, { tenantId: TENANT, workflowId: "deploy", runId: "r1" }),
    ).toBeNull()
    await t.mutation(api.workflowRuns.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      runId: "r1",
      state: { status: "done", completedStepIds: ["a"] },
      updatedAt: NOW,
    })
    const run = await t.query(api.workflowRuns.get, {
      tenantId: TENANT,
      workflowId: "deploy",
      runId: "r1",
    })
    expect(run?.state.completedStepIds).toEqual(["a"])
  })
})
