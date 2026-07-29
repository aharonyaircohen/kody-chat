import { describe, expect, it } from "vitest";
import {
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "../src/chat-knowledge";

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
    const result = searchChatKnowledge(
      graph,
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
});
