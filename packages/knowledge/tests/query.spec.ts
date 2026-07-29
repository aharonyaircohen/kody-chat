import { describe, expect, it } from "vitest";
import {
  createKnowledgeContext,
  queryKnowledgeGraph,
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
      summary: "A paid customer agreement.",
      keywords: ["billing", "plan"],
      sources: [
        {
          kind: "docs",
          id: "docs/billing.md#subscription",
          resource: "https://github.test/docs/billing.md",
          revision: "abc123",
        },
      ],
    },
    {
      id: "data:subscriptions",
      label: "subscriptions",
      type: "collection",
      domain: "data",
      summary: "Stores subscription state.",
      sources: [{ kind: "cms", id: "subscriptions" }],
    },
    {
      id: "technology:billing-service",
      label: "Billing service",
      type: "service",
      domain: "technology",
      summary: "Creates and updates subscriptions.",
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

describe("Knowledge System query", () => {
  it("creates a six-domain overview without returning the full graph", () => {
    const result = queryKnowledgeGraph(graph, { overview: true });

    expect(result.graph.nodes).toHaveLength(6);
    expect(result.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "domain:data",
          properties: { entityCount: 1 },
        }),
      ]),
    );
    expect(result.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "domain:business",
          target: "domain:data",
          properties: { relationCount: 1 },
        }),
      ]),
    );
  });

  it("ranks the intended subject and returns its connected explanation", () => {
    const result = queryKnowledgeGraph(graph, {
      search: "billing plan",
      depth: 2,
      limit: 10,
    });

    expect(result.matches[0]).toMatchObject({
      id: "business:subscription",
    });
    expect(result.graph.nodes).toHaveLength(3);
  });

  it("prefers system concepts over test implementation files", () => {
    const ranked = queryKnowledgeGraph(
      {
        nodes: [
          {
            id: "technology:test",
            label: "knowledge-system.spec.ts",
            type: "file",
            domain: "technology",
            summary: "file in tests/knowledge-system.spec.ts",
          },
          {
            id: "business:knowledge-system",
            label: "Knowledge System architecture",
            type: "document_section",
            domain: "business",
            summary: "Explains how company knowledge is connected.",
          },
        ],
        edges: [],
      },
      { search: "knowledge system" },
    );

    expect(ranked.matches[0]?.id).toBe("business:knowledge-system");
  });

  it("uses explicit PR numbers as the search anchor", () => {
    const result = queryKnowledgeGraph(
      {
        nodes: [
          {
            id: "business:phase-6",
            label: "Phase 6: Files and change safety",
            type: "document_section",
            domain: "business",
            summary: "Explains which files may change.",
          },
          {
            id: "work:pr:6",
            label: "PR #6 Fix terminal state",
            type: "pull_request",
            domain: "work",
          },
        ],
        edges: [],
      },
      { search: "which files did PR 6 change" },
    );

    expect(result.subjectId).toBe("work:pr:6");
  });

  it("does not answer a missing subject from generic query words", () => {
    const result = queryKnowledgeGraph(
      {
        nodes: [
          {
            id: "business:migration",
            label: "Migration rules",
            type: "document_section",
            domain: "business",
            summary: "Rules for stored application data.",
          },
        ],
        edges: [],
      },
      { search: "where is customer data stored" },
    );

    expect(result.matches).toEqual([]);
    expect(createKnowledgeContext(result).gaps).toEqual([
      'No knowledge matched "where is customer data stored".',
    ]);
  });

  it("composes bounded agent context with relationships and evidence", () => {
    const result = queryKnowledgeGraph(graph, {
      entityId: "data:subscriptions",
      depth: 1,
      limit: 10,
    });
    const context = createKnowledgeContext(result);

    expect(context.subject).toMatchObject({
      id: "data:subscriptions",
      label: "subscriptions",
    });
    expect(context.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "Subscription",
          relation: "stored-in",
          target: "subscriptions",
        }),
        expect.objectContaining({
          source: "Billing service",
          relation: "writes",
          target: "subscriptions",
        }),
      ]),
    );
    expect(context.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "cms", id: "subscriptions" }),
        expect.objectContaining({
          kind: "github",
          id: "apps/billing/repository.ts",
        }),
      ]),
    );
    expect(context.gaps).toEqual([]);
  });

  it("states the knowledge gap when no subject matches", () => {
    const context = createKnowledgeContext(
      queryKnowledgeGraph(graph, { search: "payroll" }),
    );

    expect(context.subject).toBeNull();
    expect(context.facts).toEqual([]);
    expect(context.gaps).toEqual([
      'No knowledge matched "payroll".',
    ]);
  });

  it("keeps model context bounded independently from the UI graph", () => {
    const nodes = Array.from({ length: 60 }, (_, index) => ({
      id: `technology:node-${index}`,
      label: `Node ${index}`,
      type: "file",
      domain: "technology" as const,
      sources: [{ kind: "github", id: `src/node-${index}.ts` }],
    }));
    const largeResult = queryKnowledgeGraph(
      {
        nodes,
        edges: nodes.slice(1).map((node, index) => ({
          source: nodes[0].id,
          relation: "imports",
          target: node.id,
          sources: [{ kind: "github", id: `edge-${index}` }],
        })),
      },
      { entityId: nodes[0].id, depth: 1, limit: 60 },
    );

    const context = createKnowledgeContext(largeResult);

    expect(context.facts.length).toBeLessThanOrEqual(24);
    expect(context.relationships.length).toBeLessThanOrEqual(36);
    expect(context.sources.length).toBeLessThanOrEqual(24);
    expect(context.relationships.length).toBeGreaterThan(0);
  });

  it("keeps relationships touching the subject ahead of unrelated edges", () => {
    const subject = {
      id: "agency:capability:fix",
      label: "fix",
      type: "capability",
      domain: "agency" as const,
    };
    const implementation = {
      id: "agency:implementation:fix",
      label: "fix implementation",
      type: "implementation",
      domain: "agency" as const,
    };
    const noise = Array.from({ length: 40 }, (_, index) => ({
      id: `business:noise-${index}`,
      label: `Noise ${index}`,
      type: "document_section",
      domain: "business" as const,
    }));
    const context = createKnowledgeContext({
      query: { entityId: subject.id },
      subjectId: subject.id,
      matches: [subject],
      graph: {
        nodes: [subject, implementation, ...noise],
        edges: [
          ...noise.slice(1).map((node, index) => ({
            source: noise[index].id,
            relation: "contains",
            target: node.id,
          })),
          {
            source: subject.id,
            relation: "implemented-by",
            target: implementation.id,
          },
        ],
      },
    });

    expect(context.relationships[0]).toMatchObject({
      sourceId: subject.id,
      relation: "implemented-by",
      targetId: implementation.id,
    });
  });
});
