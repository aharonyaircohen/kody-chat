import { describe, expect, it } from "vitest";

import {
  filterKnowledgeGraph,
  parseGraphifyGraph,
} from "@dashboard/lib/knowledge-system/graph";

const graphifyGraph = {
  directed: true,
  multigraph: false,
  nodes: [
    {
      id: "repo:kody-chat",
      label: "kody-chat",
      file_type: "repository",
      domain: "project",
      description: "Dashboard monorepo",
      resource: "https://github.com/acme/kody-chat",
    },
    {
      id: "file:route",
      label: "route.ts",
      file_type: "code",
      source_file: "apps/dashboard/app/api/kody/route.ts",
      community: 2,
    },
  ],
  edges: [
    {
      source: "repo:kody-chat",
      target: "file:route",
      relation: "contains",
      confidence: "EXTRACTED",
    },
    {
      source: "missing",
      target: "file:route",
      relation: "invalid",
    },
  ],
};

describe("Graphify knowledge graph normalization", () => {
  it("keeps supported node fields and removes dangling edges", () => {
    const graph = parseGraphifyGraph(graphifyGraph);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([
      expect.objectContaining({
        id: "repo:kody-chat->file:route:contains:0",
        source: "repo:kody-chat",
        target: "file:route",
        relation: "contains",
      }),
    ]);
    expect(graph.nodes[1]).toMatchObject({
      id: "file:route",
      label: "route.ts",
      domain: "code",
      sourceFile: "apps/dashboard/app/api/kody/route.ts",
    });
  });

  it("rejects malformed graph data instead of rendering it", () => {
    expect(() => parseGraphifyGraph({ nodes: "wrong", edges: [] })).toThrow(
      "Invalid knowledge graph",
    );
    expect(() =>
      parseGraphifyGraph({ nodes: [{ label: "missing id" }], edges: [] }),
    ).toThrow("Invalid knowledge graph node");
  });

  it("filters nodes by search and domain while keeping connected edges", () => {
    const graph = parseGraphifyGraph(graphifyGraph);

    expect(filterKnowledgeGraph(graph, "route", new Set(["code"]))).toEqual({
      nodes: [expect.objectContaining({ id: "file:route" })],
      edges: [],
    });
    expect(filterKnowledgeGraph(graph, "", new Set())).toEqual(graph);
  });
});
