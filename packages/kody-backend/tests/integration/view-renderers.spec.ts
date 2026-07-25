import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const TENANT = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("viewRenderers", () => {
  it("saves and upserts view renderers", async () => {
    const t = setup()
    await t.mutation(api.viewRenderers.save, {
      tenantId: TENANT,
      slug: "card",
      definition: { v: 1 },
      updatedAt: NOW,
    })
    await t.mutation(api.viewRenderers.save, {
      tenantId: TENANT,
      slug: "card",
      definition: { v: 2 },
      updatedAt: NOW,
    })
    const renderers = await t.query(api.viewRenderers.list, { tenantId: TENANT })
    expect(renderers).toHaveLength(1)
    expect(renderers[0].definition.v).toBe(2)
  })
})
