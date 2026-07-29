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

export function searchChatKnowledge(
  graph: ChatKnowledgeGraph,
  question: string,
): ChatKnowledgeSearchResult {
  const query = tokens(question);
  const ranked = graph.graph.nodes
    .map((node, index) => {
      const label = tokens(node.label);
      const text = new Set(tokens(`${node.label} ${node.type} ${node.summary ?? ""}`));
      const matches = query.filter((token) => text.has(token)).length;
      const score = matches * 10 + query.filter((token) => label.includes(token)).length * 8;
      return { node, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 8)
    .map(({ node }) => node);

  const selected = new Set(ranked.map((node) => node.id));
  for (const edge of graph.graph.edges) {
    if (selected.has(edge.source)) selected.add(edge.target);
    if (selected.has(edge.target)) selected.add(edge.source);
    if (selected.size >= 20) break;
  }
  const facts = graph.graph.nodes.filter((node) => selected.has(node.id)).slice(0, 20);
  const byId = new Map(facts.map((node) => [node.id, node]));
  const relationships = graph.graph.edges
    .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
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
    summary: graph.summary,
    facts,
    relationships,
    sources: graph.sources.filter((source) => sourceIds.has(source.id)).slice(0, 20),
    gaps: graph.gaps.slice(0, 10),
  };
}
