import { describe, expect, it } from "vitest";
import {
  parseKnowledgeGraph,
  projectKnowledgeGraphByDomain,
  validateKnowledgeGraph,
  type KnowledgeGraph,
} from "../src";

const graph: KnowledgeGraph = {
  schemaVersion: 3,
  generatedAt: "2026-07-29T10:00:00Z",
  nodes: [
    {
      id: "business:subscription",
      label: "Subscription",
      type: "business_concept",
      domain: "business",
      summary: "The paid customer agreement.",
      sources: [{ kind: "docs", id: "docs/billing.md#subscription" }],
    },
    {
      id: "data:subscriptions",
      label: "subscriptions",
      type: "collection",
      domain: "data",
      sources: [{ kind: "cms", id: "subscriptions" }],
    },
    {
      id: "technology:billing-service",
      label: "Billing service",
      type: "service",
      domain: "technology",
      sources: [{ kind: "github", id: "apps/billing" }],
    },
  ],
  edges: [
    {
      source: "business:subscription",
      relation: "stored-in",
      target: "data:subscriptions",
      sources: [{ kind: "cms", id: "subscriptions" }],
    },
    {
      source: "technology:billing-service",
      relation: "writes",
      target: "data:subscriptions",
      sources: [{ kind: "github", id: "apps/billing/repository.ts" }],
    },
  ],
};

describe("Knowledge System domain", () => {
  it("preserves distinct source identities even when labels match", () => {
    const parsed = parseKnowledgeGraph({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "work:issue:1",
          label: "Fix billing",
          type: "issue",
          domain: "work",
          sources: [{ kind: "github", id: "issues/1" }],
        },
        {
          id: "work:issue:2",
          label: "Fix billing",
          type: "issue",
          domain: "work",
          sources: [{ kind: "github", id: "issues/2" }],
        },
      ],
    });

    expect(parsed.nodes.filter((node) => node.label === "Fix billing")).toHaveLength(2);
  });

  it("reports duplicate identities, dangling relationships, and missing evidence", () => {
    const issues = validateKnowledgeGraph({
      schemaVersion: 3,
      nodes: [
        graph.nodes[0],
        { ...graph.nodes[0], sources: undefined },
      ],
      edges: [
        {
          source: graph.nodes[0].id,
          relation: "depends-on",
          target: "missing",
        },
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate-node",
        "dangling-edge",
        "missing-provenance",
      ]),
    );
  });

  it("projects a domain with the cross-domain context that explains it", () => {
    const projection = projectKnowledgeGraphByDomain(graph, "data");

    expect(projection.nodes.map((node) => node.id)).toEqual([
      "business:subscription",
      "data:subscriptions",
      "technology:billing-service",
    ]);
    expect(projection.edges).toHaveLength(2);
  });
});
