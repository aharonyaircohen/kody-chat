import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("inbox", () => {
  it("upserts entries and lists newest first", async () => {
    const t = setup()
    await t.mutation(api.inbox.upsert, {
      tenantId: TENANT,
      login: "octocat",
      entryId: "e1",
      entry: { title: "old" },
      sentAt: "2026-01-01T00:00:00Z",
    })
    await t.mutation(api.inbox.upsert, {
      tenantId: TENANT,
      login: "octocat",
      entryId: "e2",
      entry: { title: "new" },
      sentAt: "2026-06-01T00:00:00Z",
    })
    await t.mutation(api.inbox.upsert, {
      tenantId: TENANT,
      login: "octocat",
      entryId: "e1",
      entry: { title: "old" },
      sentAt: "2026-01-01T00:00:00Z",
      readAt: NOW,
    })

    const inbox = await t.query(api.inbox.list, { tenantId: TENANT, login: "octocat" })
    expect(inbox).toHaveLength(2)
    expect(inbox[0].entry.title).toBe("new")
    expect(inbox[1].readAt).toBe(NOW)
  })
})
