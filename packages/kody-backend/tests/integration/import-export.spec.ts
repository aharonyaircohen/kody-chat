import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("importExport", () => {
  it("imports a chunk into the named table", async () => {
    const t = setup()
    const result = await t.mutation(api.importExport.importChunk, {
      table: "workflows",
      docs: [
        { tenantId: REPO, workflowId: "w1", definition: { version: 1, name: "W" }, source: "local", updatedAt: NOW },
        { tenantId: REPO, workflowId: "w2", definition: { version: 1, name: "W" }, source: "local", updatedAt: NOW },
      ],
    })
    expect(result.inserted).toBe(2)
    expect(result.updated).toBe(0)
    expect(await t.query(api.workflows.list, { tenantId: REPO })).toHaveLength(2)
  })

  it("re-importing the same chunk twice yields no duplicates", async () => {
    const t = setup()
    const docs = [
      { tenantId: REPO, workflowId: "w1", definition: { version: 1, name: "W" }, source: "local", updatedAt: NOW },
      { tenantId: REPO, workflowId: "w2", definition: { version: 1, name: "W" }, source: "local", updatedAt: NOW },
    ]
    await t.mutation(api.importExport.importChunk, { table: "workflows", docs })
    const second = await t.mutation(api.importExport.importChunk, { table: "workflows", docs })
    expect(second).toEqual({ inserted: 0, updated: 2 })
    expect(await t.query(api.workflows.list, { tenantId: REPO })).toHaveLength(2)
  })

  it("upserts by natural key: a re-import replaces the row's payload", async () => {
    const t = setup()
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ tenantId: REPO, goalId: "g1", state: { v: 1 }, updatedAt: NOW }],
    })
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ tenantId: REPO, goalId: "g1", state: { v: 2 }, updatedAt: NOW }],
    })
    const exported = await t.query(api.importExport.exportTable, { table: "goals", tenantId: REPO })
    expect(exported).toEqual([{ tenantId: REPO, goalId: "g1", state: { v: 2 }, updatedAt: NOW }])
  })

  it("upsert distinguishes multi-field natural keys (reports slug+runId)", async () => {
    const t = setup()
    const docs = [
      { tenantId: REPO, slug: "s", body: "top", meta: {}, updatedAt: NOW },
      { tenantId: REPO, slug: "s", runId: "r1", body: "run1", meta: {}, updatedAt: NOW },
      { tenantId: REPO, slug: "s", runId: "r2", body: "run2", meta: {}, updatedAt: NOW },
    ]
    await t.mutation(api.importExport.importChunk, { table: "reports", docs })
    const second = await t.mutation(api.importExport.importChunk, { table: "reports", docs })
    expect(second).toEqual({ inserted: 0, updated: 3 })
    expect(await t.query(api.importExport.exportTable, { table: "reports", tenantId: REPO })).toHaveLength(3)
  })

  it("upsert scopes to the tenant: same natural key in two tenants stays two rows", async () => {
    const t = setup()
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW }],
    })
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ tenantId: "other/tenant", goalId: "g1", state: {}, updatedAt: NOW }],
    })
    expect(await t.query(api.importExport.exportTable, { table: "goals" })).toHaveLength(2)
  })

  it("upserts global tables by their natural key (eventLog, unindexed fallback)", async () => {
    const t = setup()
    const doc = { entryId: "e1", runId: "r", event: "tick", payload: { n: 1 }, emittedAt: NOW }
    await t.mutation(api.importExport.importChunk, { table: "eventLog", docs: [doc] })
    const second = await t.mutation(api.importExport.importChunk, {
      table: "eventLog",
      docs: [{ ...doc, payload: { n: 2 } }],
    })
    expect(second).toEqual({ inserted: 0, updated: 1 })
    const all = await t.query(api.eventLog.recent, {})
    expect(all).toHaveLength(1)
    expect(all[0].payload).toEqual({ n: 2 })
  })

  it("rejects unknown tables", async () => {
    const t = setup()
    await expect(
      t.mutation(api.importExport.importChunk, { table: "not_a_table", docs: [{}] }),
    ).rejects.toThrow(/Unknown table/)
  })

  it("round-trips: import → export returns the same docs without system fields", async () => {
    const t = setup()
    const docs = [
      { tenantId: REPO, goalId: "g1", state: { state: "open" }, updatedAt: NOW },
      { tenantId: REPO, goalId: "g2", state: { state: "done" }, updatedAt: NOW },
    ]
    await t.mutation(api.importExport.importChunk, { table: "goals", docs })
    const exported = await t.query(api.importExport.exportTable, { table: "goals", tenantId: REPO })
    expect(exported).toEqual(docs)
    for (const doc of exported) {
      expect(doc).not.toHaveProperty("_id")
      expect(doc).not.toHaveProperty("_creationTime")
    }
  })

  it("exportTable filters by tenantId when given", async () => {
    const t = setup()
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [
        { tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW },
        { tenantId: "other/tenantId", goalId: "g2", state: {}, updatedAt: NOW },
      ],
    })
    expect(await t.query(api.importExport.exportTable, { table: "goals", tenantId: REPO })).toHaveLength(1)
    expect(await t.query(api.importExport.exportTable, { table: "goals" })).toHaveLength(2)
  })

  it("clearRepo wipes only that tenantId's rows and keeps global tables", async () => {
    const t = setup()
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [
        { tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW },
        { tenantId: "other/tenantId", goalId: "g2", state: {}, updatedAt: NOW },
      ],
    })
    await t.mutation(api.eventLog.append, {
      entryId: "e1",
      runId: "r",
      event: "tick",
      payload: {},
      emittedAt: NOW,
    })

    const result = await t.mutation(api.importExport.clearRepo, { tenantId: REPO })
    expect(result.deleted).toBe(1)
    expect(await t.query(api.importExport.exportTable, { table: "goals" })).toHaveLength(1)
    expect(await t.query(api.eventLog.recent, {})).toHaveLength(1)
  })

  it("dedupeTenant keeps the newest row per natural key and leaves other tenants alone", async () => {
    const t = setup()
    // Seed duplicates directly (the old insert-only import left these behind).
    await t.run(async (ctx) => {
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g1", state: { v: "old" }, updatedAt: NOW })
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g1", state: { v: "mid" }, updatedAt: NOW })
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g1", state: { v: "new" }, updatedAt: NOW })
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g2", state: { v: "solo" }, updatedAt: NOW })
      await ctx.db.insert("goals", { tenantId: "other/tenant", goalId: "g1", state: {}, updatedAt: NOW })
      await ctx.db.insert("reports", { tenantId: REPO, slug: "s", runId: "r1", body: "a", meta: {}, updatedAt: NOW })
      await ctx.db.insert("reports", { tenantId: REPO, slug: "s", runId: "r1", body: "b", meta: {}, updatedAt: NOW })
      await ctx.db.insert("reports", { tenantId: REPO, slug: "s", runId: "r2", body: "c", meta: {}, updatedAt: NOW })
    })

    const result = await t.mutation(api.importExport.dedupeTenant, { tenantId: REPO })
    expect(result.goals).toEqual({ before: 4, after: 2, deleted: 2 })
    expect(result.reports).toEqual({ before: 3, after: 2, deleted: 1 })

    const goals = await t.query(api.importExport.exportTable, { table: "goals", tenantId: REPO })
    expect(goals).toHaveLength(2)
    // Newest (highest _creationTime) row for g1 survives.
    expect(goals.map((g: { goalId: string; state: { v: string } }) => g.state.v).sort()).toEqual([
      "new",
      "solo",
    ])
    // Other tenant untouched; global tables untouched by design.
    expect(await t.query(api.importExport.exportTable, { table: "goals", tenantId: "other/tenant" })).toHaveLength(1)
    expect(result).not.toHaveProperty("eventLog")
    expect(result).not.toHaveProperty("actionStates")
  })

  it("dedupeTenant with a table arg only touches that table", async () => {
    const t = setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW })
      await ctx.db.insert("goals", { tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW })
      await ctx.db.insert("agents", { tenantId: REPO, slug: "a", frontmatter: {}, body: "x", updatedAt: NOW })
      await ctx.db.insert("agents", { tenantId: REPO, slug: "a", frontmatter: {}, body: "y", updatedAt: NOW })
    })
    const result = await t.mutation(api.importExport.dedupeTenant, { tenantId: REPO, table: "goals" })
    expect(Object.keys(result)).toEqual(["goals"])
    expect(result.goals.deleted).toBe(1)
    expect(await t.query(api.importExport.exportTable, { table: "agents", tenantId: REPO })).toHaveLength(2)
  })

  it("dedupeTenant is a no-op on clean data", async () => {
    const t = setup()
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ tenantId: REPO, goalId: "g1", state: {}, updatedAt: NOW }],
    })
    const result = await t.mutation(api.importExport.dedupeTenant, { tenantId: REPO })
    expect(result.goals).toEqual({ before: 1, after: 1, deleted: 0 })
  })

  it("supports a clear → re-import cycle (migration dry-run shape)", async () => {
    const t = setup()
    const docs = [{ tenantId: REPO, goalId: "g1", state: { v: 1 }, updatedAt: NOW }]
    await t.mutation(api.importExport.importChunk, { table: "goals", docs })
    await t.mutation(api.importExport.clearRepo, { tenantId: REPO })
    await t.mutation(api.importExport.importChunk, {
      table: "goals",
      docs: [{ ...docs[0], state: { v: 2 } }],
    })
    const exported = await t.query(api.importExport.exportTable, { table: "goals", tenantId: REPO })
    expect(exported).toHaveLength(1)
    expect((exported[0] as { state: { v: number } }).state.v).toBe(2)
  })
})
