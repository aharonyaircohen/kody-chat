import {
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  type KnowledgeEntity,
  type KnowledgeEvidence,
  type KnowledgeGraph,
  type KnowledgeRelation,
  projectKnowledgeGraphByDomain,
} from "./domain.js";

export type KnowledgeQuery = {
  overview?: boolean;
  entityId?: string;
  domain?: KnowledgeDomain;
  search?: string;
  depth?: number;
  limit?: number;
};

export type KnowledgeQueryResult = {
  query: KnowledgeQuery;
  graph: KnowledgeGraph;
  matches: KnowledgeEntity[];
  subjectId?: string;
};

export type KnowledgeContext = {
  generatedAt?: string;
  subject: {
    id: string;
    label: string;
    type: string;
    domain: KnowledgeDomain;
    summary?: string;
    owner?: string;
  } | null;
  summary: string;
  facts: Array<{
    id: string;
    label: string;
    type: string;
    domain: KnowledgeDomain;
    summary?: string;
    owner?: string;
  }>;
  relationships: Array<{
    sourceId: string;
    source: string;
    relation: string;
    targetId: string;
    target: string;
  }>;
  sources: KnowledgeEvidence[];
  gaps: string[];
};

export type KnowledgeEntityRelation = {
  direction: "incoming" | "outgoing";
  relation: string;
  node: KnowledgeEntity;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_DEPTH = 3;
const MAX_MATCHES = 5;
const MAX_CONTEXT_FACTS = 24;
const MAX_CONTEXT_RELATIONSHIPS = 36;
const MAX_CONTEXT_SOURCES = 24;

const ENTITY_TYPE_PRIORITY: Record<string, number> = {
  workflow: 24,
  capability: 24,
  decision: 22,
  business_concept: 22,
  document_section: 20,
  collection: 18,
  service: 18,
  issue: 16,
  pull_request: 14,
  document: 12,
  type: 8,
  function: 4,
};
const QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "about",
  "are",
  "by",
  "did",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);
const QUERY_SYNONYMS: Record<string, string[]> = {
  implement: ["implementation", "implemented", "implemented-by"],
  limit: ["bound", "constraint", "govern", "stop"],
  store: ["persist", "save"],
  use: ["uses", "used"],
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === "stored") return "store";
      if (token.length > 4 && token.endsWith("ies")) {
        return `${token.slice(0, -3)}y`;
      }
      if (
        token.length > 3 &&
        token.endsWith("s") &&
        !token.endsWith("ss")
      ) {
        return token.slice(0, -1);
      }
      return token;
    });
}

function queryTokens(value: string): string[] {
  return tokens(value).filter((token) => !QUERY_STOP_WORDS.has(token));
}

function searchableText(
  node: KnowledgeEntity,
  connectedText: readonly string[] = [],
): string {
  return [
    node.label,
    node.type,
    node.summary,
    node.description,
    node.owner,
    ...(node.keywords ?? []),
    node.properties ? JSON.stringify(node.properties) : undefined,
    ...connectedText,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function connectedSearchText(
  graph: KnowledgeGraph,
): ReadonlyMap<string, readonly string[]> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const connected = new Map<string, string[]>();
  const append = (
    nodeId: string,
    relation: string,
    neighbor: KnowledgeEntity | undefined,
  ) => {
    const values = connected.get(nodeId) ?? [];
    values.push(
      relation,
      neighbor?.label ?? "",
      neighbor?.type ?? "",
      neighbor?.summary ?? "",
    );
    connected.set(nodeId, values);
  };
  for (const edge of graph.edges) {
    append(edge.source, edge.relation, nodesById.get(edge.target));
    append(edge.target, edge.relation, nodesById.get(edge.source));
  }
  return connected;
}

function referencedWorkItemScore(
  node: KnowledgeEntity,
  search: string,
): number {
  const queryReference = normalizeText(search).match(
    /\b(pr|pull request|issue)\s+(\d+)\b/,
  );
  if (!queryReference) return 0;
  const labelReference = normalizeText(node.label).match(
    /\b(pr|pull request|issue)\s+(\d+)\b/,
  );
  if (!labelReference || labelReference[2] !== queryReference[2]) return 0;
  const queryKind = queryReference[1];
  const typeMatches =
    (queryKind === "issue" && node.type === "issue") ||
    (queryKind !== "issue" && node.type === "pull_request");
  return typeMatches ? 250 : 150;
}

function tokenMatches(
  token: string,
  textTokens: ReadonlySet<string>,
  haystack: string,
): boolean {
  return [token, ...(QUERY_SYNONYMS[token] ?? [])].some(
    (candidate) =>
      textTokens.has(candidate) || haystack.includes(candidate),
  );
}

type SearchDocument = {
  node: KnowledgeEntity;
  index: number;
  label: string;
  text: string;
  labelTokens: ReadonlySet<string>;
  textTokens: ReadonlySet<string>;
};

function scoreNode(
  document: SearchDocument,
  search: string,
  requiredAnchorTokens: ReadonlySet<string>,
): number {
  const { node, label, text: haystack, labelTokens, textTokens } =
    document;
  const query = normalizeText(search);
  if (!query) return 0;

  const queryTokenList = queryTokens(query);
  const matchedTokens = queryTokenList.filter(
    (token) => tokenMatches(token, textTokens, haystack),
  );
  const workItemReferenceScore = referencedWorkItemScore(node, search);
  if (
    matchedTokens.length < Math.min(2, queryTokenList.length) &&
    workItemReferenceScore === 0
  ) {
    return 0;
  }
  if (
    queryTokenList.length > 1 &&
    !matchedTokens.some((token) => requiredAnchorTokens.has(token)) &&
    workItemReferenceScore === 0
  ) {
    return 0;
  }

  let score = workItemReferenceScore;
  if (label === query) score += 100;
  else if (label.startsWith(query)) score += 60;
  else if (label.includes(query)) score += 40;

  for (const token of queryTokenList) {
    if (labelTokens.has(token)) score += 24;
    else if (textTokens.has(token)) score += 6;
    else if (tokenMatches(token, textTokens, haystack)) score += 2;
  }
  if (score > 0) score += ENTITY_TYPE_PRIORITY[node.type] ?? 0;
  const implementationPath = normalizeText(
    `${node.label} ${node.summary ?? ""}`,
  );
  if (
    node.type === "file" &&
    (implementationPath.includes(" spec ") ||
      implementationPath.includes(" test ") ||
      implementationPath.includes(" tests "))
  ) {
    score -= 50;
  }
  return score;
}

export function rankKnowledgeNodes(
  graph: KnowledgeGraph,
  search: string,
): KnowledgeEntity[] {
  const searchTokenList = queryTokens(search);
  const connectedTextById = connectedSearchText(graph);
  const documents: SearchDocument[] = graph.nodes.map((node, index) => {
    const label = normalizeText(node.label);
    const text = normalizeText(
      searchableText(node, connectedTextById.get(node.id)),
    );
    return {
      node,
      index,
      label,
      text,
      labelTokens: new Set(tokens(label)),
      textTokens: new Set(tokens(text)),
    };
  });
  const frequencies = new Map<string, number>();
  for (const token of searchTokenList) {
    frequencies.set(
      token,
      documents.filter((document) =>
        tokenMatches(token, document.textTokens, document.text),
      ).length,
    );
  }
  const minimumFrequency =
    searchTokenList.length > 0
      ? Math.min(
          ...searchTokenList.map(
            (token) => frequencies.get(token) ?? 0,
          ),
        )
      : 0;
  const requiredAnchorTokens = new Set(
    searchTokenList.filter(
      (token) => frequencies.get(token) === minimumFrequency,
    ),
  );
  return documents
    .map((document) => ({
      ...document,
      score: scoreNode(document, search, requiredAnchorTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ node }) => node);
}

export function findKnowledgeNodes(
  graph: KnowledgeGraph,
  search: string,
): KnowledgeEntity[] {
  return search.trim() ? rankKnowledgeNodes(graph, search) : graph.nodes;
}

export function createKnowledgeNeighborhood(
  graph: KnowledgeGraph,
  entityIds: readonly string[],
  options: { depth?: number; limit?: number } = {},
): KnowledgeGraph {
  const depth = Math.max(0, Math.min(options.depth ?? 1, MAX_DEPTH));
  const limit = Math.max(
    1,
    Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
  );
  const selected = new Set<string>();
  let frontier = new Set(entityIds);

  for (let level = 0; level <= depth && frontier.size > 0; level += 1) {
    const next = new Set<string>();
    for (const id of frontier) {
      if (selected.size >= limit) break;
      if (graph.nodes.some((node) => node.id === id)) selected.add(id);
    }
    if (level === depth || selected.size >= limit) break;
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !selected.has(edge.target)) {
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !selected.has(edge.source)) {
        next.add(edge.source);
      }
    }
    frontier = next;
  }

  const nodes = graph.nodes.filter((node) => selected.has(node.id));
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

function boundedGraph(graph: KnowledgeGraph, limit: number): KnowledgeGraph {
  if (graph.nodes.length <= limit) return graph;
  const nodes = graph.nodes.slice(0, limit);
  const ids = new Set(nodes.map((node) => node.id));
  return {
    ...graph,
    nodes,
    edges: graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}

function createOverviewGraph(graph: KnowledgeGraph): KnowledgeGraph {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const relationCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    const sourceDomain = nodesById.get(edge.source)?.domain;
    const targetDomain = nodesById.get(edge.target)?.domain;
    if (!sourceDomain || !targetDomain || sourceDomain === targetDomain) {
      continue;
    }
    const [source, target] = [sourceDomain, targetDomain].sort() as [
      KnowledgeDomain,
      KnowledgeDomain,
    ];
    const key = `${source}:${target}`;
    relationCounts.set(key, (relationCounts.get(key) ?? 0) + 1);
  }

  return {
    generatedAt: graph.generatedAt,
    sourceRevision: graph.sourceRevision,
    nodes: KNOWLEDGE_DOMAINS.map((domain) => ({
      id: `domain:${domain}`,
      label: `${domain[0].toLocaleUpperCase()}${domain.slice(1)}`,
      type: "knowledge_domain",
      domain,
      properties: {
        entityCount: graph.nodes.filter((node) => node.domain === domain)
          .length,
      },
    })),
    edges: [...relationCounts.entries()].map(([key, relationCount]) => {
      const [source, target] = key.split(":") as [
        KnowledgeDomain,
        KnowledgeDomain,
      ];
      return {
        source: `domain:${source}`,
        target: `domain:${target}`,
        relation: "connected",
        properties: { relationCount },
      };
    }),
  };
}

export function queryKnowledgeGraph(
  graph: KnowledgeGraph,
  query: KnowledgeQuery,
): KnowledgeQueryResult {
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const searchable = query.domain
    ? projectKnowledgeGraphByDomain(graph, query.domain)
    : graph;

  if (query.overview) {
    return {
      query,
      graph: createOverviewGraph(graph),
      matches: [],
    };
  }

  if (query.entityId) {
    const subject = graph.nodes.find((node) => node.id === query.entityId);
    return {
      query,
      graph: subject
        ? createKnowledgeNeighborhood(graph, [subject.id], {
            depth: query.depth,
            limit,
          })
        : { ...graph, nodes: [], edges: [] },
      matches: subject ? [subject] : [],
      subjectId: subject?.id,
    };
  }

  if (query.search?.trim()) {
    const matches = rankKnowledgeNodes(searchable, query.search).slice(
      0,
      MAX_MATCHES,
    );
    return {
      query,
      graph:
        matches.length > 0
          ? createKnowledgeNeighborhood(
              graph,
              matches.map((match) => match.id),
              { depth: query.depth, limit },
            )
          : { ...graph, nodes: [], edges: [] },
      matches,
      subjectId: matches[0]?.id,
    };
  }

  const projected = query.domain
    ? projectKnowledgeGraphByDomain(graph, query.domain)
    : graph;
  return {
    query,
    graph: boundedGraph(projected, limit),
    matches: projected.nodes.slice(0, MAX_MATCHES),
    subjectId: projected.nodes[0]?.id,
  };
}

function contextEntity(node: KnowledgeEntity) {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    domain: node.domain,
    summary: node.summary ?? node.description,
    owner: node.owner,
  };
}

function contextRelationship(
  edge: KnowledgeRelation,
  nodesById: ReadonlyMap<string, KnowledgeEntity>,
) {
  const source = nodesById.get(edge.source);
  const target = nodesById.get(edge.target);
  if (!source || !target) return null;
  return {
    sourceId: source.id,
    source: source.label,
    relation: edge.relation,
    targetId: target.id,
    target: target.label,
  };
}

function uniqueEvidence(
  values: Array<KnowledgeEvidence[] | undefined>,
): KnowledgeEvidence[] {
  const evidence = new Map<string, KnowledgeEvidence>();
  for (const source of values.flatMap((value) => value ?? [])) {
    const key = `${source.kind}:${source.id}:${source.revision ?? ""}`;
    if (!evidence.has(key)) evidence.set(key, source);
  }
  return [...evidence.values()];
}

export function createKnowledgeContext(
  result: KnowledgeQueryResult,
): KnowledgeContext {
  const allNodesById = new Map(
    result.graph.nodes.map((node) => [node.id, node]),
  );
  const subject = result.subjectId
    ? allNodesById.get(result.subjectId) ?? null
    : null;
  const adjacentIds = new Set<string>();
  if (subject) {
    for (const edge of result.graph.edges) {
      if (edge.source === subject.id) adjacentIds.add(edge.target);
      if (edge.target === subject.id) adjacentIds.add(edge.source);
    }
  }
  const prioritizedIds = new Set<string>();
  const prioritize = (node: KnowledgeEntity | undefined) => {
    if (node) prioritizedIds.add(node.id);
  };
  prioritize(subject ?? undefined);
  for (const id of adjacentIds) prioritize(allNodesById.get(id));
  for (const match of result.matches) prioritize(allNodesById.get(match.id));
  for (const node of result.graph.nodes) prioritize(node);
  const contextNodes = [
    ...prioritizedIds,
  ]
    .flatMap((id) => {
      const node = allNodesById.get(id);
      return node ? [node] : [];
    })
    .slice(0, MAX_CONTEXT_FACTS);
  const contextNodeIds = new Set(contextNodes.map((node) => node.id));
  const nodesById = new Map(contextNodes.map((node) => [node.id, node]));
  const contextEdges = result.graph.edges
    .filter(
      (edge) =>
        contextNodeIds.has(edge.source) && contextNodeIds.has(edge.target),
    )
    .map((edge, index) => ({
      edge,
      index,
      subjectDistance:
        edge.source === subject?.id || edge.target === subject?.id ? 0 : 1,
    }))
    .sort(
      (left, right) =>
        left.subjectDistance - right.subjectDistance ||
        left.index - right.index,
    )
    .map(({ edge }) => edge)
    .slice(0, MAX_CONTEXT_RELATIONSHIPS);
  const relationships = contextEdges.flatMap((edge) => {
    const relationship = contextRelationship(edge, nodesById);
    return relationship ? [relationship] : [];
  });
  const sources = uniqueEvidence([
    ...contextNodes.map((node) => node.sources),
    ...contextEdges.map((edge) => edge.sources),
  ]).slice(0, MAX_CONTEXT_SOURCES);
  const gaps: string[] = [];
  if (!subject && result.query.search?.trim()) {
    gaps.push(`No knowledge matched "${result.query.search.trim()}".`);
  } else if (!subject && result.query.entityId) {
    gaps.push(`Knowledge entity "${result.query.entityId}" was not found.`);
  }
  if (
    result.graph.nodes.some((node) => !node.sources?.length) ||
    result.graph.edges.some((edge) => !edge.sources?.length)
  ) {
    gaps.push("Some returned knowledge has no source evidence.");
  }

  const summary = subject
    ? subject.summary ??
      subject.description ??
      `${subject.label} is a ${subject.type} in the ${subject.domain} domain.`
    : gaps[0] ?? "No knowledge context is available.";

  return {
    generatedAt: result.graph.generatedAt,
    subject: subject ? contextEntity(subject) : null,
    summary,
    facts: contextNodes.map(contextEntity),
    relationships,
    sources,
    gaps,
  };
}

export function getKnowledgeEntityRelations(
  graph: KnowledgeGraph,
  entityId: string,
): KnowledgeEntityRelation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges.flatMap((edge): KnowledgeEntityRelation[] => {
    if (edge.source === entityId) {
      const node = nodesById.get(edge.target);
      return node
        ? [{ direction: "outgoing", relation: edge.relation, node }]
        : [];
    }
    if (edge.target === entityId) {
      const node = nodesById.get(edge.source);
      return node
        ? [{ direction: "incoming", relation: edge.relation, node }]
        : [];
    }
    return [];
  });
}
