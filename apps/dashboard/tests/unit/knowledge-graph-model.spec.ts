import { describe, expect, it } from "vitest";
import {
  findKnowledgeNodes,
  getKnowledgeNodeRelations,
  parseKnowledgeGraph,
} from "@dashboard/features/knowledge-system/model/knowledge-graph";
import {
  classifyKnowledgeNode,
  createKnowledgeAreaMap,
  getKnowledgeAreas,
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
      id: "goal:ship",
      label: "Ship safely",
      type: "goal",
      domain: "business",
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
      id: "report:7",
      label: "Release report",
      type: "report",
      domain: "quality",
    },
    {
      id: "raw:function",
      label: "renderGraph()",
      source_file: "src/render.ts",
    },
  ],
  edges: [
    {
      source: "repo:acme/widgets",
      target: "goal:ship",
      relation: "has-goal",
    },
    { source: "agent:kody", target: "issue:7", relation: "works-on" },
    { source: "issue:7", target: "report:7", relation: "produced" },
    { source: "raw:function", target: "agent:kody", relation: "calls" },
  ],
};

describe("knowledge graph model", () => {
  it("keeps only meaningful typed entities and valid relations", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toHaveLength(3);
  });

  it("creates one overall graph from real entities and real relations", () => {
    const map = createKnowledgeAreaMap(
      parseKnowledgeGraph(rawGraph),
      "overall",
    );

    expect(map.nodes).toHaveLength(5);
    expect(map.nodes.every((node) => node.kind === "entity")).toBe(true);
    expect(map.edges).toHaveLength(3);
    expect(map.edges.every((edge) => edge.kind === "relation")).toBe(true);
  });

  it("offers semantic domain views without a redundant project view", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(getKnowledgeAreas(graph)).toEqual([
      "purpose",
      "product",
      "work",
      "agency",
      "evidence",
    ]);
    expect(classifyKnowledgeNode(graph.nodes[0]!)).toBe("product");
  });

  it("keeps direct context in a focused view", () => {
    const map = createKnowledgeAreaMap(parseKnowledgeGraph(rawGraph), "work");

    expect(map.nodes.map((node) => node.id)).toEqual([
      "issue:7",
      "agent:kody",
      "report:7",
    ]);
    expect(map.edges).toHaveLength(2);
  });

  it("searches entities and explains their relations", () => {
    const graph = parseKnowledgeGraph(rawGraph);

    expect(findKnowledgeNodes(graph, "release").map((node) => node.id)).toEqual([
      "issue:7",
      "report:7",
    ]);
    expect(getKnowledgeNodeRelations(graph, "issue:7")).toEqual([
      {
        direction: "incoming",
        relation: "works-on",
        node: expect.objectContaining({ id: "agent:kody" }),
      },
      {
        direction: "outgoing",
        relation: "produced",
        node: expect.objectContaining({ id: "report:7" }),
      },
    ]);
  });
});
