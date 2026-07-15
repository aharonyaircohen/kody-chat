import { describe, expect, it } from "vitest"
import { ConvexHttpClient } from "convex/browser"
import { anyApi } from "convex/server"

// Smoke layer: a handful of real calls against a live deployment. Skipped
// unless CONVEX_URL is set (i.e. after `npx convex dev` has created the
// project). Run: CONVEX_URL=… pnpm vitest --project smoke
const url = process.env.CONVEX_URL

describe.skipIf(!url)("deployment smoke", () => {
  const client = url ? new ConvexHttpClient(url) : null!
  const repo = `smoke-test/${Date.now()}`

  it("writes and reads a workflow", async () => {
    await client.mutation(anyApi.workflows.save, {
      repo,
      workflowId: "smoke",
      definition: { version: 1, name: "Smoke" },
      source: "local",
      updatedAt: new Date().toISOString(),
    })
    const got = await client.query(anyApi.workflows.get, { repo, workflowId: "smoke" })
    expect(got?.definition?.name).toBe("Smoke")
  })

  it("appends and tails chat events", async () => {
    await client.mutation(anyApi.chat.appendEvent, {
      repo,
      sessionId: "smoke",
      event: { ping: true },
    })
    const events = await client.query(anyApi.chat.eventsSince, {
      repo,
      sessionId: "smoke",
      afterSeq: -1,
    })
    expect(events.length).toBeGreaterThan(0)
  })

  it("cleans up its own rows", async () => {
    const result = await client.mutation(anyApi.importExport.clearRepo, { repo })
    expect(result.deleted).toBeGreaterThan(0)
  })
})
