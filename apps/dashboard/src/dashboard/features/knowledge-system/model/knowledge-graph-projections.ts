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

const FOCUSED_AREA_LIMIT = 60;
const FOCUSED_CONTEXT_LIMIT = 20;

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
  const type = node.type.toLocaleLowerCase().replaceAll("-", "_");
  return TYPE_AREAS[type] ?? DOMAIN_AREAS[node.domain];
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
  const nodes =
    view === "overall"
      ? graph.nodes
      : selectFocusedNodes(graph, view, degrees);
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
