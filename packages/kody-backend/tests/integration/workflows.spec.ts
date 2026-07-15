import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("workflows", () => {
  it("saves and lists definitions scoped to a repo", async () => {
    const t = setup()
    await t.mutation(api.workflows.save, {
      repo: REPO,
      workflowId: "deploy",
      definition: { version: 1, name: "Deploy" },
      source: "local",
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.save, {
      repo: "other/repo",
      workflowId: "deploy",
      definition: { version: 1, name: "Other" },
      source: "local",
      updatedAt: NOW,
    })

    const list = await t.query(api.workflows.list, { repo: REPO })
    expect(list).toHaveLength(1)
    expect(list[0].definition.name).toBe("Deploy")
  })

  it("upserts instead of duplicating on re-save", async () => {
    const t = setup()
    const args = {
      repo: REPO,
      workflowId: "deploy",
      definition: { version: 1, name: "Deploy" },
      source: "local" as const,
      updatedAt: NOW,
    }
    await t.mutation(api.workflows.save, args)
    await t.mutation(api.workflows.save, {
      ...args,
      definition: { version: 1, name: "Deploy v2" },
    })

    const list = await t.query(api.workflows.list, { repo: REPO })
    expect(list).toHaveLength(1)
    expect(list[0].definition.name).toBe("Deploy v2")
  })

  it("gets a single definition and returns null when missing", async () => {
    const t = setup()
    expect(await t.query(api.workflows.get, { repo: REPO, workflowId: "nope" })).toBeNull()
    await t.mutation(api.workflows.save, {
      repo: REPO,
      workflowId: "deploy",
      definition: { version: 1 },
      source: "store",
      updatedAt: NOW,
    })
    const got = await t.query(api.workflows.get, { repo: REPO, workflowId: "deploy" })
    expect(got?.source).toBe("store")
  })

  it("removes a definition idempotently", async () => {
    const t = setup()
    await t.mutation(api.workflows.save, {
      repo: REPO,
      workflowId: "deploy",
      definition: {},
      source: "local",
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.remove, { repo: REPO, workflowId: "deploy" })
    await t.mutation(api.workflows.remove, { repo: REPO, workflowId: "deploy" })
    expect(await t.query(api.workflows.list, { repo: REPO })).toHaveLength(0)
  })

  it("saves, upserts, and lists runs per workflow", async () => {
    const t = setup()
    await t.mutation(api.workflows.saveRun, {
      repo: REPO,
      workflowId: "deploy",
      runId: "r1",
      state: { status: "running", completedStepIds: [] },
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.saveRun, {
      repo: REPO,
      workflowId: "deploy",
      runId: "r1",
      state: { status: "done", completedStepIds: ["a"] },
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.saveRun, {
      repo: REPO,
      workflowId: "other",
      runId: "r9",
      state: { status: "running" },
      updatedAt: NOW,
    })

    const runs = await t.query(api.workflows.listRuns, { repo: REPO, workflowId: "deploy" })
    expect(runs).toHaveLength(1)
    expect(runs[0].state.status).toBe("done")

    const run = await t.query(api.workflows.getRun, {
      repo: REPO,
      workflowId: "deploy",
      runId: "r1",
    })
    expect(run?.state.completedStepIds).toEqual(["a"])
  })
})
