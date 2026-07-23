import type { KnowledgeGraph } from "./graph";

export type CytoscapeElement = {
  data: {
    id: string;
    label?: string;
    domain?: string;
    type?: string;
    source?: string;
    target?: string;
    relation?: string;
  };
};

/** Converts the neutral graph contract to Cytoscape's neutral element format. */
export function toCytoscapeElements(graph: KnowledgeGraph): CytoscapeElement[] {
  return [
    ...graph.nodes.map((node) => ({
      data: {
        id: node.id,
        label: node.label,
        domain: node.domain,
        type: node.type,
      },
    })),
    ...graph.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
      },
    })),
  ];
}
