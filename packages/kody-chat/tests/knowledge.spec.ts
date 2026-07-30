import { describe, expect, it } from "vitest";
import {
  buildChatKnowledgeIndex,
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "../src/knowledge";

const graph = parseChatKnowledgeGraph({
  schemaVersion: 1,
  kind: "chat-knowledge-graph",
  status: "built",
  summary: "Acme builds a subscription product.",
  graph: {
    nodes: [
      {
        id: "product",
        type: "product",
        label: "Widgets",
        summary: "The customer-facing subscription product.",
        sourceIds: ["docs"],
      },
      {
        id: "billing",
        type: "service",
        label: "Billing service",
        summary: "Owns subscription charging.",
        sourceIds: ["repo"],
      },
      {
        id: "subscriptions",
        type: "collection",
        label: "Subscriptions",
        summary: "Stores current subscription state.",
        sourceIds: ["db"],
      },
    ],
    edges: [
      {
        source: "product",
        target: "billing",
        relation: "charged_by",
        sourceIds: ["docs", "repo"],
      },
      {
        source: "billing",
        target: "subscriptions",
        relation: "writes",
        sourceIds: ["repo", "db"],
      },
    ],
  },
  sources: [
    {
      id: "docs",
      kind: "repository",
      locator: "docs/product.md",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "Widgets is a subscription product.",
    },
    {
      id: "repo",
      kind: "repository",
      locator: "apps/billing",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "Billing writes subscription state.",
    },
    {
      id: "db",
      kind: "cms",
      locator: "subscriptions",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "Subscription records.",
    },
  ],
  coverage: [],
  gaps: [],
});

describe("Chat knowledge search", () => {
  it("returns a bounded connected answer with evidence", () => {
    const index = buildChatKnowledgeIndex(graph);
    const result = searchChatKnowledge(
      index,
      "Where is subscription state stored?",
    );
    expect(result.facts.map((fact) => fact.id)).toContain("subscriptions");
    expect(result.relationships).toContainEqual(
      expect.objectContaining({ source: "billing", target: "subscriptions" }),
    );
    expect(result.sources.map((source) => source.id)).toEqual(
      expect.arrayContaining(["repo", "db"]),
    );
    expect(result.facts.length).toBeLessThanOrEqual(20);
    expect(result.sources.length).toBeLessThanOrEqual(20);
  });

  it("builds reusable lookup maps without copying the graph", () => {
    const index = buildChatKnowledgeIndex(graph);

    expect(index.graph).toBe(graph);
    expect(index.nodesById.get("billing")).toBe(graph.graph.nodes[1]);
    expect(index.neighborsById.get("billing")).toEqual([
      "product",
      "subscriptions",
    ]);
  });

  it("returns the same connected neighborhood regardless of edge order", () => {
    const reversed = {
      ...graph,
      graph: {
        ...graph.graph,
        edges: [...graph.graph.edges].reverse(),
      },
    };

    const forwardResult = searchChatKnowledge(
      buildChatKnowledgeIndex(graph),
      "What does the product use for charging?",
    );
    const reversedResult = searchChatKnowledge(
      buildChatKnowledgeIndex(reversed),
      "What does the product use for charging?",
    );

    expect(reversedResult.facts.map((fact) => fact.id)).toEqual(
      forwardResult.facts.map((fact) => fact.id),
    );
    expect(reversedResult.relationships).toEqual(forwardResult.relationships);
  });

  it("rejects dangling relationships", () => {
    expect(() =>
      parseChatKnowledgeGraph({
        ...graph,
        graph: {
          nodes: graph.graph.nodes,
          edges: [{ source: "missing", target: "product", relation: "owns" }],
        },
      }),
    ).toThrow(/edge/i);
  });

  it("rejects invalid graph, node, and source records", () => {
    expect(() => parseChatKnowledgeGraph(null)).toThrow(/graph/i);
    expect(() =>
      parseChatKnowledgeGraph({
        ...graph,
        graph: { nodes: [{}], edges: [] },
      }),
    ).toThrow(/node/i);
    expect(() =>
      parseChatKnowledgeGraph({
        ...graph,
        sources: [{}],
      }),
    ).toThrow(/source/i);
  });

  it("normalizes optional metadata and valid gaps", () => {
    const parsed = parseChatKnowledgeGraph({
      kind: "chat-knowledge-graph",
      status: "blocked",
      graph: {
        nodes: [{ id: "company", type: "company", label: "Acme" }],
        edges: [],
      },
      sources: [],
      gaps: [
        {
          questionId: "business-1",
          reason: "CRM access is missing",
          neededSourceKinds: ["crm"],
        },
        { questionId: 1 },
      ],
    });

    expect(parsed).toMatchObject({
      schemaVersion: 1,
      status: "blocked",
      summary: "",
      coverage: [],
      gaps: [{
        questionId: "business-1",
        reason: "CRM access is missing",
        neededSourceKinds: ["crm"],
      }],
    });
    expect(parsed.graph.nodes[0]).toMatchObject({
      summary: undefined,
      sourceIds: [],
    });
  });

  it("returns an empty bounded result when no indexed terms match", () => {
    const result = searchChatKnowledge(
      buildChatKnowledgeIndex(graph),
      "unrelated terminology",
    );

    expect(result.facts).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.sources).toEqual([]);
  });
});
