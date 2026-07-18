import { beforeEach, describe, expect, it, vi } from "vitest"

const backend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock("@kody-ade/backend/api", () => ({ api: { catalog: { list: "list", get: "get", save: "save", remove: "remove" } } }))
vi.mock("@kody-ade/backend/client", () => ({ createBackendClient: () => backend }))
vi.mock("@dashboard/lib/capabilities", () => ({ isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug), PERMISSION_MODES: ["default", "acceptEdits", "plan", "bypassPermissions"] }))

import { createCapabilityTools } from "../../app/api/kody/chat/tools/capability-tools"

const ctx = {
  owner: "acme",
  repo: "app",
  octokit: { rest: { repos: { get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }) }, actions: { createWorkflowDispatch: vi.fn() } } },
}

describe("Convex capability chat tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    backend.query.mockResolvedValue(null)
    backend.mutation.mockResolvedValue("id")
  })

  it("lists catalog capabilities", async () => {
    backend.query.mockResolvedValue([{ doc: { slug: "greet" } }])
    const tools = createCapabilityTools(ctx as never)
    await expect(tools.list_capabilities.execute!({}, {} as never)).resolves.toEqual({ capabilities: [{ slug: "greet" }] })
  })

  it("creates and updates a catalog capability", async () => {
    const tools = createCapabilityTools(ctx as never)
    const result = await tools.create_or_update_capability.execute!({ slug: "greet", describe: "", instructions: "say hello", landing: "pr", model: "inherit", permissionMode: "acceptEdits", tools: [], skills: [], shellScripts: [] }, {} as never)
    expect(result).toMatchObject({ ok: true, action: "created", slug: "greet" })
    expect(backend.mutation).toHaveBeenCalledWith("save", expect.objectContaining({ category: "capability", slug: "greet" }))
  })

  it("deletes and dispatches catalog capabilities", async () => {
    backend.query.mockResolvedValue({ doc: { slug: "greet", profileJson: "{}" } })
    const tools = createCapabilityTools(ctx as never)
    await expect(tools.delete_capability.execute!({ slug: "greet" }, {} as never)).resolves.toMatchObject({ ok: true })
    await expect(tools.run_capability.execute!({ slug: "greet" }, {} as never)).resolves.toMatchObject({ ok: true, capability: "greet" })
  })
})
