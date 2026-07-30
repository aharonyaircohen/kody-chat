/** Evidence-backed, bounded knowledge retrieval owned by Kody Chat. */
export type ChatKnowledgeNode = {
  id: string;
  type: string;
  label: string;
  summary?: string;
  sourceIds: string[];
};

export type ChatKnowledgeEdge = {
  source: string;
  target: string;
  relation: string;
  sourceIds: string[];
};

export type ChatKnowledgeSource = {
  id: string;
  kind: string;
  locator: string;
  observedAt: string;
  evidence: string;
};

export type ChatKnowledgeGraph = {
  schemaVersion: number;
  kind: "chat-knowledge-graph";
  status: "built" | "blocked";
  summary: string;
  graph: {
    nodes: ChatKnowledgeNode[];
    edges: ChatKnowledgeEdge[];
  };
  sources: ChatKnowledgeSource[];
  coverage: unknown[];
  gaps: Array<{
    questionId: string;
    reason: string;
    neededSourceKinds: string[];
  }>;
};

export type ChatKnowledgeSearchResult = {
  summary: string;
  facts: ChatKnowledgeNode[];
  relationships: Array<
    ChatKnowledgeEdge & { sourceLabel: string; targetLabel: string }
  >;
  sources: ChatKnowledgeSource[];
  gaps: ChatKnowledgeGraph["gaps"];
};

export type ChatKnowledgeIndex = {
  graph: ChatKnowledgeGraph;
  nodesById: ReadonlyMap<string, ChatKnowledgeNode>;
  neighborsById: ReadonlyMap<string, readonly string[]>;
  nodeIdsByToken: ReadonlyMap<string, readonly string[]>;
  labelTokensById: ReadonlyMap<string, ReadonlySet<string>>;
  searchableTokensById: ReadonlyMap<string, ReadonlySet<string>>;
  nodeOrderById: ReadonlyMap<string, number>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function parseChatKnowledgeGraph(value: unknown): ChatKnowledgeGraph {
  const root = record(value);
  const graph = record(root?.graph);
  if (
    !root ||
    root.kind !== "chat-knowledge-graph" ||
    !graph ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(root.sources)
  ) {
    throw new Error("Invalid Chat knowledge graph");
  }
  const nodes = graph.nodes.map((item) => {
    const node = record(item);
    if (
      !node ||
      typeof node.id !== "string" ||
      typeof node.type !== "string" ||
      typeof node.label !== "string"
    ) {
      throw new Error("Invalid Chat knowledge node");
    }
    return {
      id: node.id,
      type: node.type,
      label: node.label,
      summary: typeof node.summary === "string" ? node.summary : undefined,
      sourceIds: strings(node.sourceIds),
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.map((item) => {
    const edge = record(item);
    if (
      !edge ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string" ||
      typeof edge.relation !== "string" ||
      !ids.has(edge.source) ||
      !ids.has(edge.target)
    ) {
      throw new Error("Invalid Chat knowledge edge");
    }
    return {
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      sourceIds: strings(edge.sourceIds),
    };
  });
  const sources = root.sources.map((item) => {
    const source = record(item);
    if (
      !source ||
      typeof source.id !== "string" ||
      typeof source.kind !== "string" ||
      typeof source.locator !== "string" ||
      typeof source.observedAt !== "string" ||
      typeof source.evidence !== "string"
    ) {
      throw new Error("Invalid Chat knowledge source");
    }
    return source as ChatKnowledgeSource;
  });
  return {
    schemaVersion:
      typeof root.schemaVersion === "number" ? root.schemaVersion : 1,
    kind: "chat-knowledge-graph",
    status: root.status === "blocked" ? "blocked" : "built",
    summary: typeof root.summary === "string" ? root.summary : "",
    graph: { nodes, edges },
    sources,
    coverage: Array.isArray(root.coverage) ? root.coverage : [],
    gaps: (Array.isArray(root.gaps) ? root.gaps : []).flatMap((item) => {
      const gap = record(item);
      return gap &&
        typeof gap.questionId === "string" &&
        typeof gap.reason === "string"
        ? [{
            questionId: gap.questionId,
            reason: gap.reason,
            neededSourceKinds: strings(gap.neededSourceKinds),
          }]
        : [];
    }),
  };
}

const STOP = new Set([
  "a", "an", "and", "are", "do", "does", "for", "how", "in", "is", "of",
  "on", "the", "to", "what", "where", "which", "who", "why",
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP.has(token));
}

export function buildChatKnowledgeIndex(
  graph: ChatKnowledgeGraph,
): ChatKnowledgeIndex {
  const nodesById = new Map(
    graph.graph.nodes.map((node) => [node.id, node] as const),
  );
  const nodeOrderById = new Map(
    graph.graph.nodes.map((node, index) => [node.id, index] as const),
  );
  const labelTokensById = new Map<string, ReadonlySet<string>>();
  const searchableTokensById = new Map<string, ReadonlySet<string>>();
  const mutableNodeIdsByToken = new Map<string, string[]>();
  const mutableNeighborsById = new Map(
    graph.graph.nodes.map((node) => [node.id, new Set<string>()] as const),
  );

  for (const node of graph.graph.nodes) {
    labelTokensById.set(node.id, new Set(tokens(node.label)));
    const searchableTokens = new Set(
      tokens(`${node.label} ${node.type} ${node.summary ?? ""}`),
    );
    searchableTokensById.set(node.id, searchableTokens);
    for (const token of searchableTokens) {
      const nodeIds = mutableNodeIdsByToken.get(token) ?? [];
      mutableNodeIdsByToken.set(token, [...nodeIds, node.id]);
    }
  }
  for (const edge of graph.graph.edges) {
    mutableNeighborsById.get(edge.source)!.add(edge.target);
    mutableNeighborsById.get(edge.target)!.add(edge.source);
  }

  const byNodeOrder = (left: string, right: string) =>
    nodeOrderById.get(left)! - nodeOrderById.get(right)!;
  const neighborsById = new Map(
    [...mutableNeighborsById].map(([nodeId, neighbors]) => [
      nodeId,
      [...neighbors].sort(byNodeOrder),
    ]),
  );
  const nodeIdsByToken = new Map(
    [...mutableNodeIdsByToken].map(([token, nodeIds]) => [
      token,
      [...nodeIds].sort(byNodeOrder),
    ]),
  );

  return {
    graph,
    nodesById,
    neighborsById,
    nodeIdsByToken,
    labelTokensById,
    searchableTokensById,
    nodeOrderById,
  };
}

export function searchChatKnowledge(
  index: ChatKnowledgeIndex,
  question: string,
): ChatKnowledgeSearchResult {
  const query = tokens(question);
  const candidateIds = new Set(
    query.flatMap((token) => index.nodeIdsByToken.get(token) ?? []),
  );
  const ranked = [...candidateIds]
    .map((nodeId) => {
      const node = index.nodesById.get(nodeId)!;
      const label = index.labelTokensById.get(nodeId)!;
      const searchable = index.searchableTokensById.get(nodeId)!;
      const matches = query.filter((token) => searchable.has(token)).length;
      const score =
        matches * 10 +
        query.filter((token) => label.has(token)).length * 8;
      return { node, score, index: index.nodeOrderById.get(nodeId)! };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .map(({ node }) => node);

  const selected = new Set(ranked.map((node) => node.id));
  const queue = [...selected];
  while (queue.length > 0 && selected.size < 20) {
    const nodeId = queue.shift()!;
    for (const neighborId of index.neighborsById.get(nodeId) ?? []) {
      if (selected.has(neighborId)) continue;
      selected.add(neighborId);
      queue.push(neighborId);
      if (selected.size >= 20) break;
    }
  }
  const facts = [...selected]
    .map((nodeId) => index.nodesById.get(nodeId)!)
    .slice(0, 20);
  const byId = new Map(facts.map((node) => [node.id, node]));
  const relationships = index.graph.graph.edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
    .sort((left, right) =>
      left.source.localeCompare(right.source) ||
      left.target.localeCompare(right.target) ||
      left.relation.localeCompare(right.relation)
    )
    .slice(0, 30)
    .map((edge) => ({
      ...edge,
      sourceLabel: byId.get(edge.source)!.label,
      targetLabel: byId.get(edge.target)!.label,
    }));
  const sourceIds = new Set([
    ...facts.flatMap((node) => node.sourceIds),
    ...relationships.flatMap((edge) => edge.sourceIds),
  ]);
  return {
    summary: index.graph.summary,
    facts,
    relationships,
    sources: index.graph.sources
      .filter((source) => sourceIds.has(source.id))
      .slice(0, 20),
    gaps: index.graph.gaps.slice(0, 10),
  };
}
