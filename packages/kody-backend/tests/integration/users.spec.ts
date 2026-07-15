import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("users", () => {
  it("saves and upserts user-state per namespace and user", async () => {
    const t = setup()
    await t.mutation(api.users.saveUserState, {
      tenantId: REPO,
      namespace: "profile",
      userKey: "u1",
      data: { name: "A" },
      updatedAt: NOW,
    })
    await t.mutation(api.users.saveUserState, {
      tenantId: REPO,
      namespace: "profile",
      userKey: "u1",
      data: { name: "B" },
      updatedAt: NOW,
    })
    await t.mutation(api.users.saveUserState, {
      tenantId: REPO,
      namespace: "stats",
      userKey: "u1",
      data: { count: 1 },
      updatedAt: NOW,
    })

    const profile = await t.query(api.users.getUserState, {
      tenantId: REPO,
      namespace: "profile",
      userKey: "u1",
    })
    expect(profile?.data.name).toBe("B")
    expect(
      await t.query(api.users.getUserState, { tenantId: REPO, namespace: "profile", userKey: "u2" }),
    ).toBeNull()
  })

  it("saves and upserts notification prefs per login", async () => {
    const t = setup()
    await t.mutation(api.users.saveNotificationPrefs, {
      tenantId: REPO,
      login: "octocat",
      prefs: { muted: [] },
      updatedAt: NOW,
    })
    await t.mutation(api.users.saveNotificationPrefs, {
      tenantId: REPO,
      login: "octocat",
      prefs: { muted: ["ci"] },
      updatedAt: NOW,
    })
    const prefs = await t.query(api.users.getNotificationPrefs, { tenantId: REPO, login: "octocat" })
    expect(prefs?.prefs.muted).toEqual(["ci"])
  })

  it("upserts inbox entries and lists newest first", async () => {
    const t = setup()
    await t.mutation(api.users.upsertInboxEntry, {
      tenantId: REPO,
      login: "octocat",
      entryId: "e1",
      entry: { title: "old" },
      sentAt: "2026-01-01T00:00:00Z",
    })
    await t.mutation(api.users.upsertInboxEntry, {
      tenantId: REPO,
      login: "octocat",
      entryId: "e2",
      entry: { title: "new" },
      sentAt: "2026-06-01T00:00:00Z",
    })
    await t.mutation(api.users.upsertInboxEntry, {
      tenantId: REPO,
      login: "octocat",
      entryId: "e1",
      entry: { title: "old" },
      sentAt: "2026-01-01T00:00:00Z",
      readAt: NOW,
    })

    const inbox = await t.query(api.users.listInbox, { tenantId: REPO, login: "octocat" })
    expect(inbox).toHaveLength(2)
    expect(inbox[0].entry.title).toBe("new")
    expect(inbox[1].readAt).toBe(NOW)
  })

  it("saves and upserts channels-seen manifests", async () => {
    const t = setup()
    await t.mutation(api.users.saveChannelsSeen, {
      tenantId: REPO,
      login: "octocat",
      manifest: { version: 1, seen: {} },
      updatedAt: NOW,
    })
    await t.mutation(api.users.saveChannelsSeen, {
      tenantId: REPO,
      login: "octocat",
      manifest: { version: 1, seen: { "1": NOW } },
      updatedAt: NOW,
    })
    const seen = await t.query(api.users.getChannelsSeen, { tenantId: REPO, login: "octocat" })
    expect(seen?.manifest.seen["1"]).toBe(NOW)
  })
})
