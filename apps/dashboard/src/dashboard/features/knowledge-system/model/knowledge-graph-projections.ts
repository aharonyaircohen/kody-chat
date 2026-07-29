import {
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  type KnowledgeEdge,
  type KnowledgeGraph,
  type KnowledgeNode,
} from "./knowledge-graph";

export const KNOWLEDGE_AREAS = KNOWLEDGE_DOMAINS;

export type KnowledgeArea = KnowledgeDomain;
export type KnowledgeView = "overall" | KnowledgeArea;

export const KNOWLEDGE_AREA_LABELS: Record<KnowledgeArea, string> = {
  company: "Company",
  business: "Business",
  data: "Data",
  technology: "Technology",
  work: "Work",
  agency: "Agency",
};

export type KnowledgeMapNode = KnowledgeNode & {
  displayLabel: string;
  count: number;
  area: KnowledgeArea;
  kind: "entity";
};

export type KnowledgeMapEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: "relation";
};

export type KnowledgeMap = {
  nodes: KnowledgeMapNode[];
  edges: KnowledgeMapEdge[];
};

const FOCUSED_AREA_LIMIT = 18;
const FOCUSED_CONTEXT_LIMIT = 8;
const RESULT_LIMIT = 12;

export function classifyKnowledgeNode(node: KnowledgeNode): KnowledgeArea {
  return node.domain;
}

export function getKnowledgeAreas(graph: KnowledgeGraph): KnowledgeArea[] {
  const present = new Set(graph.nodes.map(classifyKnowledgeNode));
  return KNOWLEDGE_AREAS.filter((area) => present.has(area));
}

export function createKnowledgeAreaMap(
  graph: KnowledgeGraph,
  view: KnowledgeView,
): KnowledgeMap {
  if (view === "overall") return createOverallLayerMap(graph);

  const degrees = getDegrees(graph.edges);
  const nodes = selectFocusedNodes(graph, view, degrees);
  const selectedIds = new Set(nodes.map((node) => node.id));

  return {
    nodes: nodes.map((node) => ({
      ...node,
      displayLabel: `${node.label}\n${formatType(node.type)}`,
      count: degrees.get(node.id) ?? 0,
      area: classifyKnowledgeNode(node),
      kind: "entity",
    })),
    edges: graph.edges
      .filter(
        (edge) =>
          selectedIds.has(edge.source) && selectedIds.has(edge.target),
      )
      .map((edge, index) => ({
        id: `relation:${index}:${edge.source}:${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: formatType(edge.relation),
        kind: "relation",
      })),
  };
}

function createOverallLayerMap(graph: KnowledgeGraph): KnowledgeMap {
  if (
    graph.nodes.length === KNOWLEDGE_AREAS.length &&
    graph.nodes.every((node) => node.type === "knowledge_domain")
  ) {
    return {
      nodes: graph.nodes.map((node) => {
        const entityCount =
          typeof node.properties?.entityCount === "number"
            ? node.properties.entityCount
            : 0;
        return {
          ...node,
          displayLabel: `${KNOWLEDGE_AREA_LABELS[node.domain]}\n${entityCount.toLocaleString()} entities`,
          count: entityCount,
          area: node.domain,
          kind: "entity",
        };
      }),
      edges: graph.edges.map((edge, index) => ({
        id: `layer:${index}:${edge.source}:${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: `${
          typeof edge.properties?.relationCount === "number"
            ? edge.properties.relationCount
            : 0
        } relations`,
        kind: "relation",
      })),
    };
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const counts = new Map(
    KNOWLEDGE_AREAS.map((domain) => [
      domain,
      graph.nodes.filter((node) => node.domain === domain).length,
    ]),
  );
  const relations = new Map<
    string,
    { source: KnowledgeArea; target: KnowledgeArea; count: number }
  >();

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.source)?.domain;
    const target = nodeById.get(edge.target)?.domain;
    if (!source || !target || source === target) continue;
    const [first, second] = [source, target].sort() as [
      KnowledgeArea,
      KnowledgeArea,
    ];
    const key = `${first}:${second}`;
    const existing = relations.get(key);
    if (existing) existing.count += 1;
    else relations.set(key, { source: first, target: second, count: 1 });
  }

  return {
    nodes: KNOWLEDGE_AREAS.map((domain) => ({
      id: `domain:${domain}`,
      label: KNOWLEDGE_AREA_LABELS[domain],
      displayLabel: `${KNOWLEDGE_AREA_LABELS[domain]}\n${(counts.get(domain) ?? 0).toLocaleString()} entities`,
      type: "knowledge_domain",
      domain,
      area: domain,
      count: counts.get(domain) ?? 0,
      kind: "entity",
    })),
    edges: [...relations.values()].map((relation) => ({
      id: `layer:${relation.source}:${relation.target}`,
      source: `domain:${relation.source}`,
      target: `domain:${relation.target}`,
      label: `${relation.count} relations`,
      kind: "relation",
    })),
  };
}

export function selectKnowledgeResults(
  graph: KnowledgeGraph,
  options: { domain: KnowledgeView; query: string },
): KnowledgeNode[] {
  const query = options.query.trim().toLocaleLowerCase();
  const degrees = getDegrees(graph.edges);
  const candidates = graph.nodes.filter(
    (node) =>
      (options.domain === "overall" || node.domain === options.domain) &&
      (!query ||
        node.label.toLocaleLowerCase().includes(query) ||
        node.type.toLocaleLowerCase().includes(query) ||
        node.description?.toLocaleLowerCase().includes(query)),
  );
  return rankNodes(candidates, degrees).slice(0, RESULT_LIMIT);
}

function selectFocusedNodes(
  graph: KnowledgeGraph,
  area: KnowledgeArea,
  degrees: Map<string, number>,
): KnowledgeNode[] {
  const focusNodes = rankNodes(
    graph.nodes.filter((node) => classifyKnowledgeNode(node) === area),
    degrees,
  ).slice(0, FOCUSED_AREA_LIMIT);
  const focusIds = new Set(focusNodes.map((node) => node.id));
  const contextIds = new Set<string>();

  for (const edge of graph.edges) {
    if (focusIds.has(edge.source) && !focusIds.has(edge.target)) {
      contextIds.add(edge.target);
    }
    if (focusIds.has(edge.target) && !focusIds.has(edge.source)) {
      contextIds.add(edge.source);
    }
  }

  const contextNodes = rankNodes(
    graph.nodes.filter((node) => contextIds.has(node.id)),
    degrees,
  ).slice(0, FOCUSED_CONTEXT_LIMIT);
  return [...focusNodes, ...contextNodes];
}

function rankNodes(
  nodes: KnowledgeNode[],
  degrees: Map<string, number>,
): KnowledgeNode[] {
  return [...nodes].sort(
    (left, right) =>
      (degrees.get(right.id) ?? 0) - (degrees.get(left.id) ?? 0) ||
      left.label.localeCompare(right.label),
  );
}

function getDegrees(edges: KnowledgeEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }
  return degrees;
}

function formatType(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
