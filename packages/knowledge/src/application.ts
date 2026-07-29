import {
  validateKnowledgeGraph,
  type KnowledgeGraph,
  type KnowledgeGraphValidationIssue,
} from "./domain.js";
import {
  createKnowledgeContext,
  queryKnowledgeGraph,
  type KnowledgeContext,
  type KnowledgeQuery,
} from "./query.js";
export interface KnowledgeGraphReader {
  read(tenantId: string): Promise<KnowledgeGraph>;
}

export type RepositoryKnowledgeResult = {
  graph: KnowledgeGraph;
  context: KnowledgeContext;
};

export class InvalidKnowledgeGraphError extends Error {
  constructor(
    public readonly issues: KnowledgeGraphValidationIssue[],
  ) {
    super("The published knowledge graph is structurally invalid.");
    this.name = "InvalidKnowledgeGraphError";
  }
}

export async function queryRepositoryKnowledge(
  reader: KnowledgeGraphReader,
  tenantId: string,
  query: KnowledgeQuery,
): Promise<RepositoryKnowledgeResult> {
  const graph = await reader.read(tenantId);
  const structuralIssues = validateKnowledgeGraph(graph).filter(
    (issue) =>
      issue.code === "duplicate-node" || issue.code === "dangling-edge",
  );
  if (structuralIssues.length > 0) {
    throw new InvalidKnowledgeGraphError(structuralIssues);
  }

  const result = queryKnowledgeGraph(graph, query);
  return {
    graph: result.graph,
    context: createKnowledgeContext(result),
  };
}
