import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }));
vi.mock("@kody-ade/backend/api", () => ({ api: { repoDocs: { get: "repoDocs:get", listByPrefix: "repoDocs:listByPrefix", save: "repoDocs:save", remove: "repoDocs:remove" } } }));
vi.mock("@kody-ade/backend/client", () => ({ createBackendClient: () => backend }));
vi.mock("../src/github", () => ({ getOwner: () => "acme", getRepo: () => "app", getOctokit: () => ({}) }));

import { listTodoFiles, readTodoFile, writeTodoFile } from "../src/todos/files";

describe("Convex todo storage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists and reads tenant todo documents", async () => {
    const doc = {
      title: "Ship",
      outcome: "Release is shipped.",
      status: "todo",
      evidence: [],
      checklist: [],
      blockers: [],
      runIds: [],
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
    };
    backend.query.mockResolvedValueOnce([{ kind: "todo:ship", doc, updatedAt: "2026-01-02" }]);
    await expect(listTodoFiles()).resolves.toMatchObject([{ slug: "ship", title: "Ship", sha: "" }]);
    backend.query.mockResolvedValueOnce({ doc, updatedAt: "2026-01-02" });
    await expect(readTodoFile("ship")).resolves.toMatchObject({ slug: "ship", updatedAt: "2026-01-02" });
  });

  it("writes todo documents to Convex", async () => {
    backend.mutation.mockResolvedValue(undefined);
    await writeTodoFile({
      octokit: {} as never,
      slug: "ship",
      todo: {
        title: "Ship",
        outcome: "Release is shipped.",
        status: "todo",
        evidence: [],
        checklist: [],
        blockers: [],
        runIds: [],
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    });
    expect(backend.mutation).toHaveBeenCalledWith("repoDocs:save", expect.objectContaining({ tenantId: "acme/app", kind: "todo:ship" }));
  });
});
