import type {
  KnowledgeDomain,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
} from "./knowledge-graph";

export const KNOWLEDGE_AREAS = [
  "purpose",
  "product",
  "work",
  "agency",
  "evidence",
] as const;

export type KnowledgeArea = (typeof KNOWLEDGE_AREAS)[number];
export type KnowledgeView = "overall" | KnowledgeArea;

export const KNOWLEDGE_AREA_LABELS: Record<KnowledgeArea, string> = {
  purpose: "Purpose",
  product: "Product",
  work: "Work",
  agency: "Agency",
  evidence: "Evidence",
};

export type KnowledgeMapNode = {
  id: string;
  label: string;
  displayLabel: string;
  count: number;
  area: KnowledgeArea;
  domain: KnowledgeDomain;
  kind: "area" | "entity";
  type?: string;
  description?: string;
  resource?: string;
};

export type KnowledgeMapEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  count: number;
  kind: "membership" | "relation";
};

export type KnowledgeMap = {
  nodes: KnowledgeMapNode[];
  edges: KnowledgeMapEdge[];
  layout: "cose";
};

const OVERALL_AREA_LIMIT = 8;
const FOCUSED_AREA_LIMIT = 45;
const FOCUSED_CONTEXT_LIMIT = 15;

const TYPE_AREAS: Partial<Record<string, KnowledgeArea>> = {
  intent: "purpose",
  goal: "purpose",
  objective: "purpose",
  priority: "purpose",
  outcome: "purpose",

  repository: "product",
  product: "product",
  feature: "product",
  journey: "product",
  user_journey: "product",
  code_area: "product",
  document: "product",
  doc: "product",
  note: "product",
  context: "product",
  memory: "product",

  task: "work",
  todo: "work",
  issue: "work",
  pull_request: "work",
  pr: "work",
  finding: "work",
  approval: "work",

  agent: "agency",
  operation: "agency",
  loop: "agency",
  workflow: "agency",
  capability: "agency",
  implementation: "agency",
  trigger: "agency",
  policy: "agency",
  constraint: "agency",

  run: "evidence",
  evidence: "evidence",
  artifact: "evidence",
  report: "evidence",
  check: "evidence",
  test: "evidence",
  failure: "evidence",
  decision: "evidence",
  qa: "evidence",
};

const DOMAIN_AREAS: Record<KnowledgeDomain, KnowledgeArea> = {
  project: "product",
  business: "purpose",
  agency: "agency",
  execution: "agency",
  work: "work",
  quality: "evidence",
  knowledge: "product",
  technical: "product",
  other: "product",
};

export function classifyKnowledgeNode(node: KnowledgeNode): KnowledgeArea {
  const normalizedType = node.type.toLocaleLowerCase().replaceAll("-", "_");
  return TYPE_AREAS[normalizedType] ?? DOMAIN_AREAS[node.domain];
}

export function getKnowledgeAreas(graph: KnowledgeGraph): KnowledgeArea[] {
  const present = new Set(graph.nodes.map(classifyKnowledgeNode));
  return KNOWLEDGE_AREAS.filter((area) => present.has(area));
}

export function createKnowledgeAreaMap(
  graph: KnowledgeGraph,
  view: KnowledgeView,
): KnowledgeMap {
  const degrees = getDegrees(graph.edges);
  const selectedNodes =
    view === "overall"
      ? selectOverallNodes(graph, degrees)
      : selectFocusedNodes(graph, view, degrees);
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
  );

  if (view !== "overall") {
    return {
      nodes: selectedNodes.map((node) =>
        toEntityNode(node, degrees.get(node.id) ?? 0),
      ),
      edges: visibleEdges.map(toMapEdge),
      layout: "cose",
    };
  }

  const areas = KNOWLEDGE_AREAS.filter((area) =>
    selectedNodes.some((node) => classifyKnowledgeNode(node) === area),
  );
  const areaNodes: KnowledgeMapNode[] = areas.map((area) => ({
    id: areaNodeId(area),
    label: KNOWLEDGE_AREA_LABELS[area],
    displayLabel: KNOWLEDGE_AREA_LABELS[area],
    count: selectedNodes.filter((node) => classifyKnowledgeNode(node) === area)
      .length,
    area,
    domain: area === "purpose" ? "business" : "other",
    kind: "area",
  }));

  return {
    nodes: [
      ...areaNodes,
      ...selectedNodes.map((node) =>
        toEntityNode(node, degrees.get(node.id) ?? 0),
      ),
    ],
    edges: [
      ...selectedNodes.map((node, index) => ({
        id: `membership:${index}:${node.id}`,
        source: areaNodeId(classifyKnowledgeNode(node)),
        target: node.id,
        label: "",
        count: 1,
        kind: "membership" as const,
      })),
      ...visibleEdges.map(toMapEdge),
    ],
    layout: "cose",
  };
}

function areaNodeId(area: KnowledgeArea): string {
  return `knowledge-area:${area}`;
}

function selectOverallNodes(
  graph: KnowledgeGraph,
  degrees: Map<string, number>,
): KnowledgeNode[] {
  const selected = new Set<string>();
  for (const area of KNOWLEDGE_AREAS) {
    for (const node of rankNodes(
      graph.nodes.filter(
        (candidate) => classifyKnowledgeNode(candidate) === area,
      ),
      degrees,
    ).slice(0, OVERALL_AREA_LIMIT)) {
      selected.add(node.id);
    }
  }
  return graph.nodes.filter((node) => selected.has(node.id));
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

function toEntityNode(node: KnowledgeNode, count: number): KnowledgeMapNode {
  return {
    ...node,
    displayLabel: `${node.label}\n${node.type.replaceAll("_", " ").replaceAll("-", " ")}`,
    count,
    area: classifyKnowledgeNode(node),
    kind: "entity",
  };
}

function toMapEdge(edge: KnowledgeEdge, index: number): KnowledgeMapEdge {
  return {
    id: `relation:${index}:${edge.source}:${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.relation.replaceAll("-", " "),
    count: 1,
    kind: "relation",
  };
}
