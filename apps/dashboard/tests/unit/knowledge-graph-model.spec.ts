import { describe, expect, it } from "vitest";
import {
  findKnowledgeNodes,
  getKnowledgeDomainFilters,
  getKnowledgeNodeNeighborhood,
  getKnowledgeNodeRelations,
  parseKnowledgeGraph,
} from "@dashboard/features/knowledge-system/model/knowledge-graph";
import {
  classifyKnowledgeNode,
  createKnowledgeAreaMap,
} from "@dashboard/features/knowledge-system/model/knowledge-graph-projections";

const rawGraph = {
  nodes: [
    {
      id: "repo:acme/widgets",
      label: "acme/widgets",
      type: "repository",
      domain: "project",
    },
    {
      id: "agent:kody",
      label: "Kody",
      type: "agent",
      domain: "agency",
    },
    {
      id: "issue:7",
      label: "Broken release",
      type: "issue",
      domain: "work",
    },
    {
      id: "area:dashboard",
      label: "apps/dashboard",
      type: "code_area",
      domain: "technical",
    },
    {
      id: "implementation:review",
      label: "Review implementation",
      type: "implementation",
      domain: "execution",
    },
    {
      id: "raw:function",
      label: "renderGraph()",
      source_file: "src/render.ts",
    },
  ],
  edges: [
    {
      source: "implementation:review",
      target: "agent:kody",
      relation: "run-by",
    },
    { source: "agent:kody", target: "issue:7", relation: "works-on" },
    {
      source: "repo:acme/widgets",
      target: "area:dashboard",
      relation: "has-area",
    },
    { source: "raw:function", target: "agent:kody", relation: "calls" },
  ],
};

describe("knowledge graph model", () => {
  it("accepts only meaningful typed nodes and their valid relations", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "repo:acme/widgets",
      "agent:kody",
      "issue:7",
      "area:dashboard",
      "implementation:review",
    ]);
    expect(graph.edges).toHaveLength(3);
  });

  it("keeps the repository in the overall graph without a redundant Project tab", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(getKnowledgeDomainFilters(graph)).toEqual([
      "agency",
      "execution",
      "work",
      "technical",
    ]);
  });

  it("places meaningful entities into the five user-facing areas", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(
      graph.nodes.map((node) => [node.id, classifyKnowledgeNode(node)]),
    ).toEqual([
      ["repo:acme/widgets", "product"],
      ["agent:kody", "agency"],
      ["issue:7", "work"],
      ["area:dashboard", "product"],
      ["implementation:review", "agency"],
    ]);
  });

  it("builds one readable overall graph from real entities and area groups", () => {
    const graph = parseKnowledgeGraph(rawGraph);
    const map = createKnowledgeAreaMap(graph, "overall");

    expect(map.nodes.filter((node) => node.kind === "area")).toEqual([
      expect.objectContaining({
        id: "knowledge-area:product",
        label: "Product",
      }),
      expect.objectContaining({ id: "knowledge-area:work", label: "Work" }),
      expect.objectContaining({ id: "knowledge-area:agency", label: "Agency" }),
    ]);
    expect(map.nodes.filter((node) => node.kind === "entity")).toHaveLength(5);
    expect(map.nodes.find((node) => node.id === "agent:kody")).toEqual(
      expect.objectContaining({
        label: "Kody",
        displayLabel: "Kody\nagent",
        type: "agent",
      }),
    );
    expect(map.edges.filter((edge) => edge.kind === "membership")).toHaveLength(
      5,
    );
    expect(map.edges.filter((edge) => edge.kind === "relation")).toHaveLength(
      3,
    );
  });

  it("keeps direct context when focusing one area", () => {
    const graph = parseKnowledgeGraph(rawGraph);
    const map = createKnowledgeAreaMap(graph, "work");

    expect(map.nodes.map((node) => node.id)).toEqual(["issue:7", "agent:kody"]);
    expect(map.edges).toEqual([
      expect.objectContaining({
        source: "agent:kody",
        target: "issue:7",
        label: "works on",
        kind: "relation",
      }),
    ]);
  });

  it("searches meaningful entity fields without changing the graph", () => {
    const graph = parseKnowledgeGraph(rawGraph);
    const result = findKnowledgeNodes(graph, "release");

    expect(result.map((node) => node.id)).toEqual(["issue:7"]);
  });

  it("explains the incoming and outgoing relations for a selected node", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(getKnowledgeNodeRelations(graph, "agent:kody")).toEqual([
      {
        direction: "incoming",
        relation: "run-by",
        node: expect.objectContaining({ id: "implementation:review" }),
      },
      {
        direction: "outgoing",
        relation: "works-on",
        node: expect.objectContaining({ id: "issue:7" }),
      },
    ]);
  });

  it("shows only a selected node and its direct relationships", () => {
    const graph = parseKnowledgeGraph(rawGraph);
    const result = getKnowledgeNodeNeighborhood(graph, "agent:kody");

    expect(result.nodes.map((node) => node.id)).toEqual([
      "agent:kody",
      "issue:7",
      "implementation:review",
    ]);
    expect(result.edges).toHaveLength(2);
  });
});
