import { beforeEach, describe, expect, it, vi } from "vitest"

const backend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock("@kody-ade/backend/api", () => ({ api: { repoDocs: { get: "get", save: "save" } } }))
vi.mock("@kody-ade/backend/client", () => ({ createBackendClient: () => backend }))
vi.mock("@kody-ade/base/logger", () => ({ logger: { warn: vi.fn() } }))

import { _resetSnippetsCache, getSnippets, mutateSnippets } from "../../src/dashboard/lib/snippets/store"

const snippet = { id: "tag", name: "Tag", html: "<script>x()</script>", placement: "body-start", enabled: true }

describe("Convex snippets store", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetSnippetsCache()
    backend.query.mockResolvedValue(null)
    backend.mutation.mockResolvedValue("doc-id")
  })

  it("returns an empty list when no Convex document exists", async () => {
    await expect(getSnippets({} as never, "acme", "shop")).resolves.toEqual([])
  })

  it("loads snippets from repoDocs", async () => {
    backend.query.mockResolvedValue({ doc: { version: 1, snippets: [snippet] } })
    await expect(getSnippets({} as never, "acme", "shop")).resolves.toEqual([snippet])
  })

  it("saves mutated snippets to repoDocs", async () => {
    const result = await mutateSnippets({} as never, "acme", "shop", (items) => [...items, snippet])
    expect(result).toEqual([snippet])
    expect(backend.mutation).toHaveBeenCalledWith("save", expect.objectContaining({ kind: "snippets/config.json" }))
  })
})
