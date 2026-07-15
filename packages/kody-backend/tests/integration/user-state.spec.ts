import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("userState", () => {
  it("saves and upserts user-state per namespace and user", async () => {
    const t = setup()
    await t.mutation(api.userState.save, {
      tenantId: TENANT,
      namespace: "profile",
      userKey: "u1",
      data: { name: "A" },
      updatedAt: NOW,
    })
    await t.mutation(api.userState.save, {
      tenantId: TENANT,
      namespace: "profile",
      userKey: "u1",
      data: { name: "B" },
      updatedAt: NOW,
    })
    await t.mutation(api.userState.save, {
      tenantId: TENANT,
      namespace: "stats",
      userKey: "u1",
      data: { count: 1 },
      updatedAt: NOW,
    })

    const profile = await t.query(api.userState.get, {
      tenantId: TENANT,
      namespace: "profile",
      userKey: "u1",
    })
    expect(profile?.data.name).toBe("B")
  })

  it("returns null for an unknown user", async () => {
    const t = setup()
    expect(
      await t.query(api.userState.get, { tenantId: TENANT, namespace: "profile", userKey: "u2" }),
    ).toBeNull()
  })
})
