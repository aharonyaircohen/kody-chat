import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@kody-ade/backend/api", () => ({ api: { repoDocs: { get: "repoDocs:get", listByPrefix: "repoDocs:listByPrefix", save: "repoDocs:save", remove: "repoDocs:remove" } } }));
vi.mock("@kody-ade/backend/client", () => ({ createBackendClient: () => backend }));
vi.mock("../src/github", () => ({ getOwner: () => "acme", getRepo: () => "app", getOctokit: () => ({}) }));

import { listMemoryFiles, readMemoryFile, writeMemoryFile } from "../src/memory/files";

describe("Convex memory storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists and reads tenant memory documents", async () => {
    backend.query.mockResolvedValueOnce([{ kind: "memory:prefers-plain", doc: { meta: { name: "Plain", description: "Use plain language", type: "feedback", created: "2026-01-01" }, body: "Keep answers simple." }, updatedAt: "2026-01-02" }]);
    await expect(listMemoryFiles()).resolves.toMatchObject([{ id: "prefers-plain", body: "Keep answers simple.", sha: "" }]);
    backend.query.mockResolvedValueOnce({ doc: { meta: { name: "Plain", description: "Use plain language", type: "feedback", created: "2026-01-01" }, body: "Keep answers simple." }, updatedAt: "2026-01-02" });
    await expect(readMemoryFile("prefers-plain")).resolves.toMatchObject({ id: "prefers-plain", updatedAt: "2026-01-02" });
  });

  it("writes memory as a tenant document", async () => {
    backend.mutation.mockResolvedValue(undefined);
    backend.query.mockResolvedValue({ doc: { meta: { name: "Plain", description: "Use plain language", type: "feedback", created: "2026-01-01" }, body: "Keep answers simple." }, updatedAt: "2026-01-02" });
    await writeMemoryFile({ octokit: {} as never, id: "prefers-plain", meta: { name: "Plain", description: "Use plain language", type: "feedback", created: "2026-01-01" }, body: "Keep answers simple." });
    expect(backend.mutation).toHaveBeenCalledWith("repoDocs:save", expect.objectContaining({ tenantId: "acme/app", kind: "memory:prefers-plain" }));
  });
});
