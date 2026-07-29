export const KNOWLEDGE_DOMAINS = [
  "company",
  "business",
  "data",
  "technology",
  "work",
  "agency",
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export type KnowledgeEvidence = {
  kind: string;
  id: string;
  resource?: string;
  revision?: string;
  observedAt?: string;
};

type KnowledgeProvenance = {
  sources?: KnowledgeEvidence[];
  observedAt?: string;
  validFrom?: string;
  validTo?: string;
  confidence?: number;
  visibility?: string;
};

export type KnowledgeEntity = KnowledgeProvenance & {
  id: string;
  label: string;
  type: string;
  domain: KnowledgeDomain;
  summary?: string;
  description?: string;
  keywords?: string[];
  resource?: string;
  owner?: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeRelation = KnowledgeProvenance & {
  source: string;
  target: string;
  relation: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeGraph = {
  schemaVersion?: number;
  generatedAt?: string;
  sourceRevision?: string;
  nodes: KnowledgeEntity[];
  edges: KnowledgeRelation[];
};

export type KnowledgeGraphValidationIssue = {
  code:
    | "duplicate-node"
    | "dangling-edge"
    | "missing-provenance"
    | "invalid-confidence";
  subject: string;
  message: string;
};

const LEGACY_DOMAIN_MAP: Record<string, KnowledgeDomain> = {
  project: "technology",
  technical: "technology",
  business: "business",
  agency: "agency",
  execution: "agency",
  work: "work",
  quality: "work",
  knowledge: "work",
  other: "work",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDomain(value: unknown): KnowledgeDomain | null {
  if (typeof value !== "string") return null;
  if (KNOWLEDGE_DOMAINS.includes(value as KnowledgeDomain)) {
    return value as KnowledgeDomain;
  }
  return LEGACY_DOMAIN_MAP[value] ?? null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function optionalStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  return strings.length > 0 ? strings : undefined;
}

function parseSources(value: unknown): KnowledgeEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value.flatMap((candidate): KnowledgeEvidence[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.kind !== "string" ||
      typeof candidate.id !== "string"
    ) {
      return [];
    }
    return [
      {
        kind: candidate.kind,
        id: candidate.id,
        resource: optionalString(candidate.resource),
        revision: optionalString(candidate.revision),
        observedAt: optionalString(candidate.observedAt),
      },
    ];
  });
  return sources.length > 0 ? sources : undefined;
}

function parseProvenance(
  value: Record<string, unknown>,
): KnowledgeProvenance {
  return {
    sources: parseSources(value.sources),
    observedAt: optionalString(value.observedAt),
    validFrom: optionalString(value.validFrom),
    validTo: optionalString(value.validTo),
    confidence: optionalNumber(value.confidence),
    visibility: optionalString(value.visibility),
  };
}

export function parseKnowledgeGraph(value: unknown): KnowledgeGraph {
  if (!isRecord(value)) throw new Error("The knowledge graph is invalid.");

  const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
  const nodes = rawNodes.flatMap((candidate): KnowledgeEntity[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.type !== "string"
    ) {
      return [];
    }
    const domain = normalizeDomain(candidate.domain);
    if (!domain) return [];
    const description = optionalString(candidate.description);
    return [
      {
        id: candidate.id,
        label: candidate.label,
        type: candidate.type,
        domain,
        summary: optionalString(candidate.summary) ?? description,
        description,
        keywords: optionalStrings(candidate.keywords),
        resource: optionalString(candidate.resource),
        owner: optionalString(candidate.owner),
        properties: optionalRecord(candidate.properties),
        ...parseProvenance(candidate),
      },
    ];
  });

  const rawEdges = Array.isArray(value.edges)
    ? value.edges
    : Array.isArray(value.links)
      ? value.links
      : [];
  const edges = rawEdges.flatMap((candidate): KnowledgeRelation[] => {
    if (
      !isRecord(candidate) ||
      typeof candidate.source !== "string" ||
      typeof candidate.target !== "string"
    ) {
      return [];
    }
    return [
      {
        source: candidate.source,
        target: candidate.target,
        relation: optionalString(candidate.relation) ?? "related",
        properties: optionalRecord(candidate.properties),
        ...parseProvenance(candidate),
      },
    ];
  });

  return {
    schemaVersion: optionalNumber(value.schemaVersion),
    generatedAt: optionalString(value.generatedAt),
    sourceRevision: optionalString(value.sourceRevision),
    nodes,
    edges,
  };
}

export function validateKnowledgeGraph(
  graph: KnowledgeGraph,
): KnowledgeGraphValidationIssue[] {
  const issues: KnowledgeGraphValidationIssue[] = [];
  const seen = new Set<string>();
  const requiresEvidence = (graph.schemaVersion ?? 1) >= 2;

  for (const node of graph.nodes) {
    if (seen.has(node.id)) {
      issues.push({
        code: "duplicate-node",
        subject: node.id,
        message: `Duplicate knowledge identity: ${node.id}`,
      });
    }
    seen.add(node.id);
    if (requiresEvidence && !node.sources?.length) {
      issues.push({
        code: "missing-provenance",
        subject: node.id,
        message: `Knowledge entity ${node.id} has no source evidence`,
      });
    }
    if (
      node.confidence !== undefined &&
      (node.confidence < 0 || node.confidence > 1)
    ) {
      issues.push({
        code: "invalid-confidence",
        subject: node.id,
        message: `Knowledge entity ${node.id} has invalid confidence`,
      });
    }
  }

  for (const edge of graph.edges) {
    const subject = `${edge.source}:${edge.relation}:${edge.target}`;
    if (!seen.has(edge.source) || !seen.has(edge.target)) {
      issues.push({
        code: "dangling-edge",
        subject,
        message: `Knowledge relationship ${subject} has a missing endpoint`,
      });
    }
    if (requiresEvidence && !edge.sources?.length) {
      issues.push({
        code: "missing-provenance",
        subject,
        message: `Knowledge relationship ${subject} has no source evidence`,
      });
    }
    if (
      edge.confidence !== undefined &&
      (edge.confidence < 0 || edge.confidence > 1)
    ) {
      issues.push({
        code: "invalid-confidence",
        subject,
        message: `Knowledge relationship ${subject} has invalid confidence`,
      });
    }
  }

  return issues;
}

export function projectKnowledgeGraphByDomain(
  graph: KnowledgeGraph,
  domain: KnowledgeDomain,
): KnowledgeGraph {
  const domainIds = new Set(
    graph.nodes
      .filter((node) => node.domain === domain)
      .map((node) => node.id),
  );
  const selectedIds = new Set(domainIds);
  const edges = graph.edges.filter((edge) => {
    const touchesDomain =
      domainIds.has(edge.source) || domainIds.has(edge.target);
    if (touchesDomain) {
      selectedIds.add(edge.source);
      selectedIds.add(edge.target);
    }
    return touchesDomain;
  });

  return {
    ...graph,
    nodes: graph.nodes.filter((node) => selectedIds.has(node.id)),
    edges,
  };
}
