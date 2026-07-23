import { describe, expect, it } from "vitest";

import { toCytoscapeElements } from "@dashboard/lib/knowledge-system/graph-view";

describe("Knowledge graph view adapter", () => {
  it("preserves every valid node and edge for the generic renderer", () => {
    const elements = toCytoscapeElements({
      nodes: [
        { id: "a", label: "A", domain: "project" },
        { id: "b", label: "B", domain: "code" },
      ],
      edges: [{ id: "a-b", source: "a", target: "b", relation: "contains" }],
    });

    expect(elements).toEqual([
      { data: { id: "a", label: "A", domain: "project", type: undefined } },
      { data: { id: "b", label: "B", domain: "code", type: undefined } },
      {
        data: {
          id: "a-b",
          source: "a",
          target: "b",
          relation: "contains",
        },
      },
    ]);
  });

  it("does not create list-order positions or a display-node cap", () => {
    const elements = toCytoscapeElements({
      nodes: Array.from({ length: 1_501 }, (_, index) => ({
        id: `node-${index}`,
        label: `Node ${index}`,
        domain: "other",
      })),
      edges: [],
    });

    expect(elements).toHaveLength(1_501);
    expect(elements[0]).not.toHaveProperty("position");
  });
});
