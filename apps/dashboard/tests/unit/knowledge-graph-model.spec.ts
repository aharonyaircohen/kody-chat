import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_DOMAINS,
  createKnowledgeNeighborhood,
  filterKnowledgeGraphByDomain,
  parseKnowledgeGraph,
  validateKnowledgeGraph,
} from "../../src/dashboard/features/knowledge-system/model/knowledge-graph";

describe("Knowledge System graph contract", () => {
  it("uses the six agreed logical domains", () => {
    expect(KNOWLEDGE_DOMAINS).toEqual([
      "company",
      "business",
      "data",
      "technology",
      "work",
      "agency",
    ]);
  });

  it("parses v2 provenance and cross-domain relationships", () => {
    const graph = parseKnowledgeGraph({
      schemaVersion: 2,
      generatedAt: "2026-07-28T10:00:00.000Z",
      nodes: [
        {
          id: "business:subscription",
          label: "Subscription",
          type: "business_entity",
          domain: "business",
          sources: [
            {
              kind: "cms",
              id: "cms/config.json#subscriptions",
              observedAt: "2026-07-28T09:00:00.000Z",
            },
          ],
        },
        {
          id: "data:mongodb:subscriptions",
          label: "subscriptions",
          type: "collection",
          domain: "data",
          sources: [
            {
              kind: "cms",
              id: "cms/config.json#subscriptions",
              observedAt: "2026-07-28T09:00:00.000Z",
            },
          ],
        },
      ],
      edges: [
        {
          source: "business:subscription",
          target: "data:mongodb:subscriptions",
          relation: "stored-in",
          sources: [
            {
              kind: "cms",
              id: "cms/config.json#subscriptions",
              observedAt: "2026-07-28T09:00:00.000Z",
            },
          ],
        },
      ],
    });

    expect(graph.schemaVersion).toBe(2);
    expect(graph.nodes[0]?.sources?.[0]?.kind).toBe("cms");
    expect(graph.edges[0]).toMatchObject({
      relation: "stored-in",
      source: "business:subscription",
      target: "data:mongodb:subscriptions",
    });
    expect(validateKnowledgeGraph(graph)).toEqual([]);
  });

  it("normalizes the existing graph domains without breaking old bundles", () => {
    const graph = parseKnowledgeGraph({
      nodes: [
        {
          id: "repo:acme/widgets",
          label: "acme/widgets",
          type: "repository",
          domain: "project",
        },
        {
          id: "run:1",
          label: "Run",
          type: "run",
          domain: "execution",
        },
      ],
      edges: [
        {
          source: "repo:acme/widgets",
          target: "run:1",
          relation: "has-run",
        },
      ],
    });

    expect(graph.nodes.map((node) => node.domain)).toEqual([
      "technology",
      "agency",
    ]);
  });

  it("reports duplicate identities, dangling links, and missing v2 provenance", () => {
    const issues = validateKnowledgeGraph({
      schemaVersion: 2,
      nodes: [
        {
          id: "business:customer",
          label: "Customer",
          type: "business_entity",
          domain: "business",
        },
        {
          id: "business:customer",
          label: "Duplicate customer",
          type: "business_entity",
          domain: "business",
        },
      ],
      edges: [
        {
          source: "business:customer",
          target: "data:missing",
          relation: "stored-in",
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-node" }),
        expect.objectContaining({ code: "dangling-edge" }),
        expect.objectContaining({ code: "missing-provenance" }),
      ]),
    );
  });

  it("provides domain views and bounded cross-domain neighborhoods", () => {
    const graph = parseKnowledgeGraph({
      schemaVersion: 2,
      nodes: [
        {
          id: "business:subscription",
          label: "Subscription",
          type: "business_entity",
          domain: "business",
        },
        {
          id: "data:subscriptions",
          label: "subscriptions",
          type: "collection",
          domain: "data",
        },
        {
          id: "technology:billing",
          label: "billing-service",
          type: "service",
          domain: "technology",
        },
      ],
      edges: [
        {
          source: "business:subscription",
          target: "data:subscriptions",
          relation: "stored-in",
        },
        {
          source: "data:subscriptions",
          target: "technology:billing",
          relation: "used-by",
        },
      ],
    });

    const business = filterKnowledgeGraphByDomain(graph, "business");
    const neighborhood = createKnowledgeNeighborhood(
      graph,
      "business:subscription",
      { depth: 2, limit: 10 },
    );

    expect(business.nodes.map((node) => node.id)).toEqual([
      "business:subscription",
      "data:subscriptions",
    ]);
    expect(business.edges).toEqual([
      expect.objectContaining({ relation: "stored-in" }),
    ]);
    expect(neighborhood.nodes.map((node) => node.id)).toEqual([
      "business:subscription",
      "data:subscriptions",
      "technology:billing",
    ]);
    expect(neighborhood.edges).toHaveLength(2);
  });
});
