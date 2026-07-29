import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const fetchMock = vi.fn();
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({ query }),
}));

import { loadDynamicChatTools } from "../../app/api/kody/chat/tools/dynamic-chat-tools";

describe("dynamic Chat tools", () => {
  beforeEach(() => {
    query.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads only repository tools returned by the enabled backend query", async () => {
    query.mockResolvedValue([
      {
        name: "search_company_knowledge",
        title: "Company knowledge",
        description: "Search verified company facts.",
        handlerKind: "knowledge_graph_search",
        dataStorageId: "storage-load-only",
        dataUrl: "https://data.test/graph.json",
      },
    ]);
    const tools = await loadDynamicChatTools("acme", "shop");

    expect(Object.keys(tools)).toEqual(["search_company_knowledge"]);
    expect(query).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: "acme/shop" },
    );
  });

  it("returns no tools when none are enabled", async () => {
    query.mockResolvedValue([]);
    expect(await loadDynamicChatTools("acme", "shop")).toEqual({});
  });

  it("does not break Chat when the dynamic-tool backend is unavailable", async () => {
    query.mockRejectedValueOnce(new Error("function not deployed"));
    expect(await loadDynamicChatTools("acme", "shop")).toEqual({});
  });

  it("downloads and indexes one graph version only once", async () => {
    query.mockResolvedValue([
      {
        name: "search_company_knowledge",
        title: "Company knowledge",
        description: "Search verified company facts.",
        handlerKind: "knowledge_graph_search",
        dataStorageId: "storage-cache-v1",
        dataUrl: "https://data.test/graph.json",
      },
    ]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: "chat-knowledge-graph",
        status: "built",
        summary: "Acme builds software.",
        graph: {
          nodes: [{
            id: "company",
            type: "company",
            label: "Acme",
            summary: "Builds software.",
            sourceIds: ["readme"],
          }],
          edges: [],
        },
        sources: [{
          id: "readme",
          kind: "repository",
          locator: "README.md",
          observedAt: "2026-07-29T10:00:00Z",
          evidence: "Acme builds software.",
        }],
        coverage: [],
        gaps: [],
      }),
    });

    const first = await loadDynamicChatTools("acme", "shop");
    const second = await loadDynamicChatTools("acme", "shop");
    const firstTool = first.search_company_knowledge as {
      execute: (input: { question: string }, options: unknown) => Promise<unknown>;
    };
    const secondTool = second.search_company_knowledge as typeof firstTool;

    await firstTool.execute({ question: "What does Acme build?" }, {});
    await Promise.all(
      Array.from({ length: 24 }, async () =>
        await secondTool.execute({ question: "What does Acme build?" }, {})
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the index when the published graph version changes", async () => {
    query
      .mockResolvedValueOnce([{
        name: "search_company_knowledge",
        title: "Company knowledge",
        description: "Search verified company facts.",
        handlerKind: "knowledge_graph_search",
        dataStorageId: "storage-rebuild-v1",
        dataUrl: "https://data.test/graph-v1.json",
      }])
      .mockResolvedValueOnce([{
        name: "search_company_knowledge",
        title: "Company knowledge",
        description: "Search verified company facts.",
        handlerKind: "knowledge_graph_search",
        dataStorageId: "storage-rebuild-v2",
        dataUrl: "https://data.test/graph-v2.json",
      }]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        kind: "chat-knowledge-graph",
        status: "built",
        summary: "Acme builds software.",
        graph: { nodes: [], edges: [] },
        sources: [],
        coverage: [],
        gaps: [],
      }),
    });

    const first = await loadDynamicChatTools("acme", "shop");
    const second = await loadDynamicChatTools("acme", "shop");
    const execute = async (tools: Record<string, unknown>) =>
      await (tools.search_company_knowledge as {
        execute: (input: { question: string }, options: unknown) => Promise<unknown>;
      }).execute({ question: "What does Acme build?" }, {});

    await execute(first);
    await execute(second);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
