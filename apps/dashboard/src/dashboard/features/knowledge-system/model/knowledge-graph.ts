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
export type KnowledgeDomainFilter = "all" | KnowledgeDomain;

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

const OVERVIEW_NODE_LIMIT = 40;
const DOMAIN_NODE_LIMIT = 80;

export function getKnowledgeDomainFilters(
  graph: KnowledgeGraph,
): KnowledgeDomain[] {
  return KNOWLEDGE_DOMAINS.filter(
    (domain) =>
      domain !== "project" &&
      graph.nodes.some((node) => node.domain === domain),
  );
}

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
    if (!isRecord(candidate)) return [];
    if (
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
    if (!isRecord(candidate)) return [];
    if (
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

export function filterKnowledgeGraph(
  graph: KnowledgeGraph,
  domain: KnowledgeDomainFilter,
  search: string,
): KnowledgeGraph {
  const query = search.trim().toLocaleLowerCase();
  if (!query && domain === "all") {
    return createKnowledgeOverview(graph);
  }

  const focusIds = new Set(
    graph.nodes
      .filter((node) => {
        if (query) {
          return (
            node.label.toLocaleLowerCase().includes(query) ||
            node.type.toLocaleLowerCase().includes(query) ||
            node.description?.toLocaleLowerCase().includes(query)
          );
        }
        return node.domain === domain;
      })
      .map((node) => node.id),
  );
  if (!query) {
    return graphFromNodeIds(
      graph,
      new Set(
        rankNodesByConnections(graph, [...focusIds])
          .slice(0, DOMAIN_NODE_LIMIT)
          .map((node) => node.id),
      ),
    );
  }

  const visibleIds = new Set(focusIds);
  for (const edge of graph.edges) {
    if (focusIds.has(edge.source)) visibleIds.add(edge.target);
    if (focusIds.has(edge.target)) visibleIds.add(edge.source);
  }
  return graphFromNodeIds(graph, visibleIds);
}

export function getKnowledgeNodeNeighborhood(
  graph: KnowledgeGraph,
  nodeId: string,
): KnowledgeGraph {
  const nodeIds = new Set([nodeId]);
  for (const edge of graph.edges) {
    if (edge.source === nodeId) nodeIds.add(edge.target);
    if (edge.target === nodeId) nodeIds.add(edge.source);
  }
  const neighborhood = graphFromNodeIds(graph, nodeIds);
  const selected = neighborhood.nodes.find((node) => node.id === nodeId);
  return selected
    ? {
        ...neighborhood,
        nodes: [
          selected,
          ...neighborhood.nodes.filter((node) => node.id !== nodeId),
        ],
      }
    : neighborhood;
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

function createKnowledgeOverview(
  graph: KnowledgeGraph,
  limit = OVERVIEW_NODE_LIMIT,
): KnowledgeGraph {
  if (graph.nodes.length <= limit) return graph;

  const projectNodes = rankNodesByConnections(
    graph,
    graph.nodes
      .filter((node) => node.domain === "project")
      .map((node) => node.id),
  ).slice(0, 1);
  const domains = getKnowledgeDomainFilters(graph);
  const selectedIds = new Set(projectNodes.map((node) => node.id));
  const perDomain = Math.max(
    1,
    Math.floor((limit - selectedIds.size) / Math.max(1, domains.length)),
  );

  for (const domain of domains) {
    const ranked = rankNodesByConnections(
      graph,
      graph.nodes
        .filter((node) => node.domain === domain)
        .map((node) => node.id),
    );
    for (const node of ranked.slice(0, perDomain)) selectedIds.add(node.id);
  }

  if (selectedIds.size < limit) {
    for (const node of rankNodesByConnections(
      graph,
      graph.nodes.map((candidate) => candidate.id),
    )) {
      selectedIds.add(node.id);
      if (selectedIds.size === limit) break;
    }
  }

  return graphFromNodeIds(graph, selectedIds);
}

function rankNodesByConnections(
  graph: KnowledgeGraph,
  nodeIds: string[],
): KnowledgeNode[] {
  const degrees = new Map<string, number>();
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  const candidates = new Set(nodeIds);
  return graph.nodes
    .filter((node) => candidates.has(node.id))
    .sort(
      (left, right) =>
        (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0) ||
        left.label.localeCompare(right.label),
    );
}

function graphFromNodeIds(
  graph: KnowledgeGraph,
  nodeIds: Set<string>,
): KnowledgeGraph {
  return {
    nodes: graph.nodes.filter((node) => nodeIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    ),
  };
}
