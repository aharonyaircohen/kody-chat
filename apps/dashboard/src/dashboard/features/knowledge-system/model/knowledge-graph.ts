export {
  KNOWLEDGE_DOMAINS,
  createKnowledgeNeighborhood as createKnowledgeNeighborhoodForIds,
  findKnowledgeNodes,
  getKnowledgeEntityRelations,
  parseKnowledgeGraph,
  projectKnowledgeGraphByDomain,
  queryKnowledgeGraph,
  validateKnowledgeGraph,
  type KnowledgeContext,
  type KnowledgeDomain,
  type KnowledgeEntity,
  type KnowledgeEntityRelation,
  type KnowledgeEvidence,
  type KnowledgeGraph,
  type KnowledgeGraphValidationIssue,
  type KnowledgeQuery,
  type KnowledgeQueryResult,
  type KnowledgeRelation,
} from "@kody-ade/knowledge";

import {
  createKnowledgeNeighborhood as createNeighborhood,
  getKnowledgeEntityRelations,
  projectKnowledgeGraphByDomain,
  type KnowledgeDomain,
  type KnowledgeEntity,
  type KnowledgeEntityRelation,
  type KnowledgeGraph,
  type KnowledgeRelation,
} from "@kody-ade/knowledge";

export type KnowledgeNode = KnowledgeEntity;
export type KnowledgeEdge = KnowledgeRelation;
export type KnowledgeSourceRef = KnowledgeEntity["sources"] extends
  | Array<infer Source>
  | undefined
  ? Source
  : never;
export type KnowledgeNodeRelation = KnowledgeEntityRelation;

export function createKnowledgeNeighborhood(
  graph: KnowledgeGraph,
  entityId: string,
  options: { depth?: number; limit?: number } = {},
): KnowledgeGraph {
  return createNeighborhood(graph, [entityId], options);
}

export function filterKnowledgeGraphByDomain(
  graph: KnowledgeGraph,
  domain: KnowledgeDomain,
): KnowledgeGraph {
  return projectKnowledgeGraphByDomain(graph, domain);
}

export function getKnowledgeNodeRelations(
  graph: KnowledgeGraph,
  nodeId: string,
): KnowledgeNodeRelation[] {
  return getKnowledgeEntityRelations(graph, nodeId);
}
