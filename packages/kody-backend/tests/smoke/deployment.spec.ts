import { describe, expect, it } from "vitest"
// Intentionally anyApi: dynamic table-name loops / raw-deployment probes
// that must not depend on the generated typed api.
import { anyApi } from "convex/server"
import { createBackendClient } from "../../src/client"

// Smoke layer: a handful of real calls against a live deployment. Skipped
// unless CONVEX_URL is set (i.e. after `npx convex dev` has created the
// project). Mutations require the deployment's service key, so also set
// KODY_SERVICE_KEY (see .env.local).
// Run: CONVEX_URL=… KODY_SERVICE_KEY=… pnpm vitest --project smoke
const url = process.env.CONVEX_URL
const serviceKey = process.env.KODY_SERVICE_KEY

describe.skipIf(!url || !serviceKey)("deployment smoke", () => {
  const client = url ? createBackendClient(url) : null!
  const tenantId = `smoke-test/${Date.now()}`

  it("writes and reads a workflow", async () => {
    await client.mutation(anyApi.workflows.save, {
      tenantId,
      workflowId: "smoke",
      definition: { version: 1, name: "Smoke" },
      source: "local",
      updatedAt: new Date().toISOString(),
    })
    const got = await client.query(anyApi.workflows.get, { tenantId, workflowId: "smoke" })
    expect(got?.definition?.name).toBe("Smoke")
  })

  it("appends and tails chat events", async () => {
    await client.mutation(anyApi.chatEvents.append, {
      tenantId,
      sessionId: "smoke",
      event: { ping: true },
    })
    const events = await client.query(anyApi.chatEvents.since, {
      tenantId,
      sessionId: "smoke",
      afterSeq: -1,
    })
    expect(events.length).toBeGreaterThan(0)
  })

  it("cleans up its own rows", async () => {
    const result = await client.mutation(anyApi.importExport.clearRepo, { tenantId })
    expect(result.deleted).toBeGreaterThan(0)
  })
})
