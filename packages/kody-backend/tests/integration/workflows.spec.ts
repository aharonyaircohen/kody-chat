import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("workflows", () => {
  it("saves and lists definitions scoped to a tenant", async () => {
    const t = setup()
    await t.mutation(api.workflows.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      definition: { version: 1, name: "Deploy" },
      source: "local",
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.save, {
      tenantId: "other/tenant",
      workflowId: "deploy",
      definition: { version: 1, name: "Other" },
      source: "local",
      updatedAt: NOW,
    })

    const list = await t.query(api.workflows.list, { tenantId: TENANT })
    expect(list).toHaveLength(1)
    expect(list[0].definition.name).toBe("Deploy")
  })

  it("upserts instead of duplicating on re-save", async () => {
    const t = setup()
    const args = {
      tenantId: TENANT,
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

    const list = await t.query(api.workflows.list, { tenantId: TENANT })
    expect(list).toHaveLength(1)
    expect(list[0].definition.name).toBe("Deploy v2")
  })

  it("gets a single definition and returns null when missing", async () => {
    const t = setup()
    expect(await t.query(api.workflows.get, { tenantId: TENANT, workflowId: "nope" })).toBeNull()
    await t.mutation(api.workflows.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      definition: { version: 1 },
      source: "store",
      updatedAt: NOW,
    })
    const got = await t.query(api.workflows.get, { tenantId: TENANT, workflowId: "deploy" })
    expect(got?.source).toBe("store")
  })

  it("removes a definition idempotently", async () => {
    const t = setup()
    await t.mutation(api.workflows.save, {
      tenantId: TENANT,
      workflowId: "deploy",
      definition: {},
      source: "local",
      updatedAt: NOW,
    })
    await t.mutation(api.workflows.remove, { tenantId: TENANT, workflowId: "deploy" })
    await t.mutation(api.workflows.remove, { tenantId: TENANT, workflowId: "deploy" })
    expect(await t.query(api.workflows.list, { tenantId: TENANT })).toHaveLength(0)
  })
})
