export const KNOWLEDGE_DOMAINS = [
  "project",
  "business",
  "agency",
  "execution",
  "work",
  "quality",
  "knowledge",
  "technical",
  "other",
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export type KnowledgeNode = {
  id: string;
  label: string;
  type: string;
  domain: KnowledgeDomain;
  description?: string;
  resource?: string;
};

export type KnowledgeEdge = {
  source: string;
  target: string;
  relation: string;
};

export type KnowledgeGraph = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
};

export type KnowledgeNodeRelation = {
  direction: "incoming" | "outgoing";
  relation: string;
  node: KnowledgeNode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDomain(value: unknown): value is KnowledgeDomain {
  return (
    typeof value === "string" &&
    KNOWLEDGE_DOMAINS.includes(value as KnowledgeDomain)
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function parseKnowledgeGraph(value: unknown): KnowledgeGraph {
  if (!isRecord(value)) throw new Error("The knowledge graph is invalid.");

  const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
  const nodes = rawNodes.flatMap((candidate): KnowledgeNode[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.type !== "string" ||
      !isDomain(candidate.domain)
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        label: candidate.label,
        type: candidate.type,
        domain: candidate.domain,
        description: optionalString(candidate.description),
        resource: optionalString(candidate.resource),
      },
    ];
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(value.edges)
    ? value.edges
    : Array.isArray(value.links)
      ? value.links
      : [];
  const edges = rawEdges.flatMap((candidate): KnowledgeEdge[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.source !== "string" ||
      typeof candidate.target !== "string" ||
      !nodeIds.has(candidate.source) ||
      !nodeIds.has(candidate.target)
    ) {
      return [];
    }

    return [
      {
        source: candidate.source,
        target: candidate.target,
        relation: optionalString(candidate.relation) ?? "related",
      },
    ];
  });

  return { nodes, edges };
}

export function findKnowledgeNodes(
  graph: KnowledgeGraph,
  search: string,
): KnowledgeNode[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return [];

  return graph.nodes.filter(
    (node) =>
      node.label.toLocaleLowerCase().includes(query) ||
      node.type.toLocaleLowerCase().includes(query) ||
      node.description?.toLocaleLowerCase().includes(query),
  );
}

export function getKnowledgeNodeRelations(
  graph: KnowledgeGraph,
  nodeId: string,
): KnowledgeNodeRelation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  return graph.edges.flatMap((edge): KnowledgeNodeRelation[] => {
    if (edge.source === nodeId) {
      const node = nodesById.get(edge.target);
      return node
        ? [{ direction: "outgoing", relation: edge.relation, node }]
        : [];
    }
    if (edge.target === nodeId) {
      const node = nodesById.get(edge.source);
      return node
        ? [{ direction: "incoming", relation: edge.relation, node }]
        : [];
    }
    return [];
  });
}
