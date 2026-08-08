import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  listSlugs: vi.fn(),
  readText: vi.fn(),
  updatedAt: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@kody-ade/base/github/core", () => ({
  getOctokit: () => ({ rest: {} }),
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));

vi.mock("@kody-ade/base/company-store/assets", () => ({
  buildCompanyStoreBlobUrl: (path: string) => `https://store.example/${path}`,
  companyStoreAssetPath: async (
    _octokit: unknown,
    kind: string,
    slug: string,
  ) => `${kind}/${slug}`,
  companyStoreUpdatedAt: store.updatedAt,
  listCompanyStoreMarkdownAssetSlugs: store.listSlugs,
  mergeAssetsBySlug: <T extends { slug: string }>(local: T[], shared: T[]) => [
    ...local,
    ...shared,
  ],
  readCompanyStoreText: store.readText,
}));

vi.mock("@kody-ade/backend/api", () => ({
  api: {
    definitions: {
      getCurrent: "definitions:getCurrent",
      listCurrent: "definitions:listCurrent",
      publish: "definitions:publish",
      retire: "definitions:retire",
    },
  },
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: store.query,
    mutation: vi.fn(),
  }),
}));

import {
  listResolvedAgentFiles,
  listStoreAgentFiles,
} from "../src/agent-files";

describe("Store agent repository activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listSlugs.mockResolvedValue(["active", "inactive"]);
    store.readText.mockImplementation(
      async (_octokit: unknown, path: string) =>
        path === "agents/active.md"
          ? "# Active agent\n"
          : "# Inactive agent\n",
    );
    store.updatedAt.mockResolvedValue("2026-07-26T00:00:00.000Z");
    store.query.mockResolvedValue([]);
  });

  it("loads only Store agents activated for the repository", async () => {
    const agents = await listStoreAgentFiles(
      { rest: {} } as never,
      new Set(),
      new Set(["active"]),
    );

    expect(agents.map((agent) => agent.slug)).toEqual(["active"]);
    expect(store.readText).toHaveBeenCalledTimes(1);
    expect(store.readText).toHaveBeenCalledWith(
      { rest: {} },
      "agents/active.md",
    );
  });

  it("does not require Store access when the repository activates no Store agents", async () => {
    const agents = await listResolvedAgentFiles({
      activeStoreSlugs: new Set(),
    });

    expect(agents).toHaveLength(7);
    expect(store.listSlugs).not.toHaveBeenCalled();
  });

  it("does not fetch a Store definition shadowed by a built-in", async () => {
    const agents = await listResolvedAgentFiles({
      activeStoreSlugs: new Set(["kody"]),
    });

    expect(agents.find(({ slug }) => slug === "kody")?.source).toBe("builtin");
    expect(store.listSlugs).not.toHaveBeenCalled();
  });
});
