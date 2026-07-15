import { describe, expect, it } from "vitest"
import { api } from "../../convex/_generated/api"
import { setup } from "./helpers"

const REPO = "acme/app"
const NOW = "2026-07-15T00:00:00.000Z"

describe("repoStore", () => {
  it("saves and upserts singleton docs by kind", async () => {
    const t = setup()
    await t.mutation(api.repoDocs.save, {
      tenantId: REPO,
      kind: "dashboard-config",
      doc: { version: 1 },
      updatedAt: NOW,
    })
    await t.mutation(api.repoDocs.save, {
      tenantId: REPO,
      kind: "dashboard-config",
      doc: { version: 1, defaultPreviewUrl: "http://x" },
      updatedAt: NOW,
    })
    const doc = await t.query(api.repoDocs.get, { tenantId: REPO, kind: "dashboard-config" })
    expect(doc?.doc.defaultPreviewUrl).toBe("http://x")
    expect(await t.query(api.repoDocs.get, { tenantId: REPO, kind: "system-prompt" })).toBeNull()
  })

  it("keeps top-level reports and run reports separate", async () => {
    const t = setup()
    await t.mutation(api.reports.save, {
      tenantId: REPO,
      slug: "weekly",
      body: "top",
      meta: {},
      updatedAt: NOW,
    })
    await t.mutation(api.reports.save, {
      tenantId: REPO,
      slug: "weekly",
      runId: "r1",
      body: "run body",
      meta: {},
      updatedAt: NOW,
    })
    await t.mutation(api.reports.save, {
      tenantId: REPO,
      slug: "weekly",
      body: "top v2",
      meta: {},
      updatedAt: NOW,
    })

    const reports = await t.query(api.reports.list, { tenantId: REPO })
    expect(reports).toHaveLength(2)
    const top = reports.find((r) => r.runId === undefined)
    expect(top?.body).toBe("top v2")
  })

  it("saves and upserts macros", async () => {
    const t = setup()
    await t.mutation(api.macros.save, {
      tenantId: REPO,
      macroId: "m1",
      macro: { id: "m1", name: "One" },
    })
    await t.mutation(api.macros.save, {
      tenantId: REPO,
      macroId: "m1",
      macro: { id: "m1", name: "Renamed" },
    })
    const macros = await t.query(api.macros.list, { tenantId: REPO })
    expect(macros).toHaveLength(1)
    expect(macros[0].macro.name).toBe("Renamed")
  })

  it("saves and upserts view renderers", async () => {
    const t = setup()
    await t.mutation(api.viewRenderers.save, {
      tenantId: REPO,
      slug: "card",
      definition: { v: 1 },
      updatedAt: NOW,
    })
    await t.mutation(api.viewRenderers.save, {
      tenantId: REPO,
      slug: "card",
      definition: { v: 2 },
      updatedAt: NOW,
    })
    const renderers = await t.query(api.viewRenderers.list, { tenantId: REPO })
    expect(renderers).toHaveLength(1)
    expect(renderers[0].definition.v).toBe(2)
  })
})
