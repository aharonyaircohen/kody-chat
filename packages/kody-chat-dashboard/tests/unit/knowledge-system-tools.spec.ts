import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeSystemTools } from "../../app/api/kody/chat/tools/knowledge-system-tools";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("knowledge system chat tools", () => {
  it("tells the model to search across domains unless scope is explicit", () => {
    const req = new NextRequest("https://dashboard.test/api/kody/chat/kody");
    const tool = createKnowledgeSystemTools({
      req,
      owner: "acme",
      repo: "shop",
    }).query_knowledge_system;

    expect(tool.description).toContain(
      "Omit domain unless the user explicitly asks to restrict",
    );
  });

  it("queries the authenticated repository knowledge endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          context: {
            subject: {
              id: "data:customers",
              label: "Customers",
              type: "collection",
              domain: "data",
            },
            summary: "Stores customer records.",
            facts: [],
            relationships: [],
            sources: [{ kind: "cms", id: "customers" }],
            gaps: [],
          },
          graph: { version: "2", nodes: [], edges: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const req = new NextRequest("https://dashboard.test/api/kody/chat/kody", {
      headers: {
        cookie: "session=abc",
        authorization: "Bearer token",
        "x-kody-token": "repo-token",
        "x-kody-owner": "acme",
        "x-kody-repo": "shop",
      },
    });

    const result = await createKnowledgeSystemTools({
      req,
      owner: "acme",
      repo: "shop",
    }).query_knowledge_system.execute!(
      { domain: "data", search: "customer", limit: 25 },
      {} as never,
    );

    expect(result).toEqual({
      subject: {
        id: "data:customers",
        label: "Customers",
        type: "collection",
        domain: "data",
      },
      summary: "Stores customer records.",
      facts: [],
      relationships: [],
      sources: [{ kind: "cms", id: "customers" }],
      gaps: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashboard.test/api/kody/knowledge-system/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          domain: "data",
          search: "customer",
          limit: 25,
        }),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("cookie")).toBe("session=abc");
    expect(headers.get("authorization")).toBe("Bearer token");
    expect(headers.get("x-kody-token")).toBe("repo-token");
    expect(headers.get("x-kody-owner")).toBe("acme");
    expect(headers.get("x-kody-repo")).toBe("shop");
  });

  it("returns a bounded error when knowledge is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "knowledge_unavailable" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const req = new NextRequest("https://dashboard.test/api/kody/chat/kody");

    const result = await createKnowledgeSystemTools({
      req,
      owner: "acme",
      repo: "shop",
    }).query_knowledge_system.execute!(
      { entityId: "data:customers", depth: 2 },
      {} as never,
    );

    expect(result).toEqual({
      error: "knowledge_unavailable",
      status: 404,
    });
  });
});
