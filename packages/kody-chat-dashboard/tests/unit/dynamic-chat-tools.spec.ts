import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({ query }),
}));

import { loadDynamicChatTools } from "../../app/api/kody/chat/tools/dynamic-chat-tools";

describe("dynamic Chat tools", () => {
  beforeEach(() => query.mockReset());

  it("loads only repository tools returned by the enabled backend query", async () => {
    query.mockResolvedValue([
      {
        name: "search_company_knowledge",
        title: "Company knowledge",
        description: "Search verified company facts.",
        handlerKind: "knowledge_graph_search",
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
});
