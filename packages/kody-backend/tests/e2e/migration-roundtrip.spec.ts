import { describe, expect, it } from "vitest"
import { ConvexHttpClient } from "convex/browser"
import { anyApi } from "convex/server"
import { mapStateFile } from "../../src/export-mapping.ts"

// E2E layer: the full migration path — state-tenantId files → export mapping →
// chunked import → domain reads → export → cleanup — against a real
// deployment. Skipped unless CONVEX_URL is set.
// Run: CONVEX_URL=… pnpm vitest --project e2e
const url = process.env.CONVEX_URL

const NOW = "2026-07-15T00:00:00.000Z"

// Simulated GitHub state-tenantId contents.
const STATE_FILES: Array<[path: string, text: string]> = [
  ["workflows/deploy/workflow.json", JSON.stringify({ version: 1, name: "Deploy", updatedAt: NOW })],
  ["workflows/deploy/runs/r1.json", JSON.stringify({ status: "done", completedStepIds: ["a"] })],
  [
    "sessions/s1.jsonl",
    [
      JSON.stringify({ type: "meta", mode: "interactive", createdAt: NOW }),
      JSON.stringify({ role: "user", content: "hi", timestamp: NOW }),
    ].join("\n"),
  ],
  ["events/s1.jsonl", JSON.stringify({ kind: "started" })],
  ["intents/i1/intent.json", JSON.stringify({ version: 1, status: "active", updatedAt: NOW })],
  ["todos/g1.json", JSON.stringify({ version: 1, state: "open" })],
  ["dashboard.json", JSON.stringify({ version: 1 })],
  ["agents/helper.md", "# helper agent"],
  ["user-state/profile/u1.json", JSON.stringify({ version: 1, data: { name: "A" }, updatedAt: NOW })],
]

describe.skipIf(!url)("migration round-trip", () => {
  const client = url ? new ConvexHttpClient(url) : null!
  const tenantId = `e2e-test/${Date.now()}`

  it("export-maps, imports, reads back through domain queries, and cleans up", async () => {
    // 1. Map files to dump rows (what export-github.ts produces).
    const byTable: Record<string, Array<Record<string, unknown>>> = {}
    for (const [path, text] of STATE_FILES) {
      const rows = mapStateFile(path, text, tenantId, NOW)
      expect(rows, `no mapping for ${path}`).not.toBeNull()
      for (const { table, doc } of rows!) {
        byTable[table] = [...(byTable[table] ?? []), doc]
      }
    }

    // 2. Import chunks (what import-convex.ts does).
    for (const [table, docs] of Object.entries(byTable)) {
      const result = await client.mutation(anyApi.importExport.importChunk, { table, docs })
      expect(result.inserted).toBe(docs.length)
    }

    // 3. Read back through the domain API.
    const workflow = await client.query(anyApi.workflows.get, { tenantId, workflowId: "deploy" })
    expect(workflow?.definition?.name).toBe("Deploy")
    const run = await client.query(anyApi.workflows.getRun, {
      tenantId,
      workflowId: "deploy",
      runId: "r1",
    })
    expect(run?.state?.status).toBe("done")
    const session = await client.query(anyApi.chat.getSession, { tenantId, sessionId: "s1" })
    expect(session?.turns).toHaveLength(1)
    const goals = await client.query(anyApi.company.listGoals, { tenantId })
    expect(goals).toHaveLength(1)
    const config = await client.query(anyApi.repoStore.getDoc, { tenantId, kind: "dashboard-config" })
    expect(config?.doc?.version).toBe(1)
    const profile = await client.query(anyApi.users.getUserState, {
      tenantId,
      namespace: "profile",
      userKey: "u1",
    })
    expect(profile?.data?.name).toBe("A")

    // 4. Export matches what went in.
    const exported = await client.query(anyApi.importExport.exportTable, {
      table: "workflows",
      tenantId,
    })
    expect(exported).toEqual(byTable.workflows)

    // 5. Cleanup.
    const cleared = await client.mutation(anyApi.importExport.clearRepo, { tenantId })
    expect(cleared.deleted).toBeGreaterThan(0)
  })
})
