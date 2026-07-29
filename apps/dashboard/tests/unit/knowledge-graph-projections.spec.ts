import { describe, expect, it } from "vitest";
import {
  createKnowledgeAreaMap,
  KNOWLEDGE_AREAS,
  selectKnowledgeResults,
} from "../../src/dashboard/features/knowledge-system/model/knowledge-graph-projections";
import type { KnowledgeGraph } from "../../src/dashboard/features/knowledge-system/model/knowledge-graph";

describe("knowledge graph projections", () => {
  it("turns the company overview into six meaningful layer entry points", () => {
    const graph: KnowledgeGraph = {
      nodes: KNOWLEDGE_AREAS.flatMap((domain, index) => [
        {
          id: `${domain}:primary`,
          label: `${domain} primary`,
          type: "entity",
          domain,
        },
        ...(index === 0
          ? [
              {
                id: `${domain}:secondary`,
                label: `${domain} secondary`,
                type: "entity",
                domain,
              },
            ]
          : []),
      ]),
      edges: [
        {
          source: "company:primary",
          target: "business:primary",
          relation: "owns",
        },
        {
          source: "business:primary",
          target: "data:primary",
          relation: "stored-in",
        },
        {
          source: "business:primary",
          target: "data:primary",
          relation: "reads",
        },
      ],
    };

    const map = createKnowledgeAreaMap(graph, "overall");

    expect(map.nodes.map((node) => node.id)).toEqual(
      KNOWLEDGE_AREAS.map((domain) => `domain:${domain}`),
    );
    expect(map.nodes.every((node) => node.type === "knowledge_domain")).toBe(
      true,
    );
    expect(map.edges).toHaveLength(2);
  });

  it("keeps real entities when a domain is selected", () => {
    const graph: KnowledgeGraph = {
      nodes: [
        {
          id: "business:customer",
          label: "Customer",
          type: "business_entity",
          domain: "business",
        },
        {
          id: "data:customers",
          label: "customers",
          type: "collection",
          domain: "data",
        },
      ],
      edges: [
        {
          source: "business:customer",
          target: "data:customers",
          relation: "stored-in",
        },
      ],
    };

    const map = createKnowledgeAreaMap(graph, "business");

    expect(map.nodes.map((node) => node.id)).toEqual([
      "business:customer",
      "data:customers",
    ]);
  });

  it("limits navigation without hiding distinct equal-label entities", () => {
    const graph: KnowledgeGraph = {
      nodes: [
        {
          id: "issue:1",
          label: "Kody control",
          type: "issue",
          domain: "work",
        },
        {
          id: "issue:2",
          label: "Kody control",
          type: "issue",
          domain: "work",
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          id: `issue:${index + 3}`,
          label: `Issue ${index + 3}`,
          type: "issue",
          domain: "work" as const,
        })),
      ],
      edges: [
        { source: "issue:1", target: "issue:3", relation: "relates-to" },
      ],
    };

    const results = selectKnowledgeResults(graph, {
      domain: "work",
      query: "",
    });
    const matchingResults = selectKnowledgeResults(graph, {
      domain: "work",
      query: "Kody control",
    });

    expect(results).toHaveLength(12);
    expect(
      matchingResults.filter((node) => node.label === "Kody control"),
    ).toHaveLength(
      2,
    );
    expect(
      results.find((node) => node.label === "Kody control")?.id,
    ).toBe("issue:1");
  });
});
