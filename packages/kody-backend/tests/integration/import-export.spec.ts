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
        { tenantId: REPO, workflowId: "w1", definition: {}, source: "local", updatedAt: NOW },
        { tenantId: REPO, workflowId: "w2", definition: {}, source: "local", updatedAt: NOW },
      ],
    })
    expect(result.inserted).toBe(2)
    expect(await t.query(api.workflows.list, { tenantId: REPO })).toHaveLength(2)
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
    await t.mutation(api.engine.appendEvent, {
      entryId: "e1",
      runId: "r",
      event: "tick",
      payload: {},
      emittedAt: NOW,
    })

    const result = await t.mutation(api.importExport.clearRepo, { tenantId: REPO })
    expect(result.deleted).toBe(1)
    expect(await t.query(api.importExport.exportTable, { table: "goals" })).toHaveLength(1)
    expect(await t.query(api.engine.recentEvents, {})).toHaveLength(1)
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
