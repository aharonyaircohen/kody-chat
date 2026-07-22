export type KnowledgeGraphNode = {
  id: string;
  label: string;
  domain: string;
  type?: string;
  description?: string;
  sourceFile?: string;
  sourceLocation?: string;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence?: number;
};

export type KnowledgeGraph = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

const MAX_NODES = 100_000;
const MAX_EDGES = 300_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferDomain(node: Record<string, unknown>): string {
  const explicit = stringValue(node.domain);
  if (explicit) return explicit.toLowerCase();

  const hint = [node.type, node.file_type, node.kind, node.category]
    .map(stringValue)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/issue|pull.?request|\bpr\b|release|run|task/.test(hint)) return "work";
  if (/agent|capability|workflow|agency/.test(hint)) return "agency";
  if (/test|\bqa\b|evidence|journey/.test(hint)) return "quality";
  if (/business|product|goal|customer/.test(hint)) return "business";
  if (/schema|table|database|dataset/.test(hint)) return "data";
  if (/doc|wiki|markdown|pdf|knowledge/.test(hint)) return "knowledge";
  if (/repository|project/.test(hint)) return "project";
  if (
    /code|file|function|class|method|module|route|service|component/.test(hint)
  ) {
    return "code";
  }
  return "other";
}

function endpointId(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const object = record(value);
  return object ? stringValue(object.id) : undefined;
}

export function parseGraphifyGraph(input: unknown): KnowledgeGraph {
  const graph = record(input);
  if (!graph || !Array.isArray(graph.nodes)) {
    throw new Error("Invalid knowledge graph");
  }
  const rawEdges = Array.isArray(graph.edges)
    ? graph.edges
    : Array.isArray(graph.links)
      ? graph.links
      : [];
  if (graph.nodes.length > MAX_NODES || rawEdges.length > MAX_EDGES) {
    throw new Error("Knowledge graph is too large");
  }

  const seen = new Set<string>();
  const nodes = graph.nodes.map((value) => {
    const node = record(value);
    const id = node ? endpointId(node.id) : undefined;
    if (!node || !id || seen.has(id)) {
      throw new Error("Invalid knowledge graph node");
    }
    seen.add(id);
    return {
      id,
      label:
        stringValue(node.label) ??
        stringValue(node.name) ??
        stringValue(node.title) ??
        id,
      domain: inferDomain(node),
      type: stringValue(node.type) ?? stringValue(node.file_type),
      description: stringValue(node.description) ?? stringValue(node.summary),
      sourceFile: stringValue(node.source_file) ?? stringValue(node.file_path),
      sourceLocation: stringValue(node.source_location),
    } satisfies KnowledgeGraphNode;
  });

  const edges: KnowledgeGraphEdge[] = [];
  rawEdges.forEach((value, index) => {
    const edge = record(value);
    const source = edge ? endpointId(edge.source) : undefined;
    const target = edge ? endpointId(edge.target) : undefined;
    if (!edge || !source || !target || !seen.has(source) || !seen.has(target))
      return;
    const relation =
      stringValue(edge.relation) ??
      stringValue(edge.type) ??
      stringValue(edge.label) ??
      "related";
    const confidence =
      typeof edge.confidence === "number" && Number.isFinite(edge.confidence)
        ? edge.confidence
        : undefined;
    edges.push({
      id: `${source}->${target}:${relation}:${index}`,
      source,
      target,
      relation,
      confidence,
    });
  });

  return { nodes, edges };
}

export function filterKnowledgeGraph(
  graph: KnowledgeGraph,
  query: string,
  domains: Iterable<string>,
): KnowledgeGraph {
  const needle = query.trim().toLowerCase();
  const selectedDomains = new Set(
    Array.from(domains, (domain) => domain.toLowerCase()),
  );
  const nodes = graph.nodes.filter((node) => {
    const domainMatches =
      !selectedDomains.size || selectedDomains.has(node.domain.toLowerCase());
    const textMatches =
      !needle ||
      [node.label, node.description, node.type, node.sourceFile]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    return domainMatches && textMatches;
  });
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}
