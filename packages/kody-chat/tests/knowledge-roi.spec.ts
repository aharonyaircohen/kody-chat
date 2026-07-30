import { describe, expect, it } from "vitest";
import {
  buildChatKnowledgeIndex,
  parseChatKnowledgeGraph,
  searchChatKnowledge,
} from "../src/knowledge";

const graph = parseChatKnowledgeGraph({
  schemaVersion: 1,
  kind: "chat-knowledge-graph",
  status: "built",
  summary: "Acme runs a subscription commerce platform.",
  graph: {
    nodes: [
      {
        id: "product",
        type: "product",
        label: "Commerce platform",
        summary: "The subscription product sold to retailers.",
        sourceIds: ["product-doc"],
      },
      {
        id: "billing-service",
        type: "service",
        label: "Billing service",
        summary: "Charges subscriptions and owns billing rules.",
        sourceIds: ["billing-code"],
      },
      {
        id: "subscriptions",
        type: "collection",
        label: "Subscriptions collection",
        summary: "Stores active subscription state in MongoDB.",
        sourceIds: ["database-schema"],
      },
      {
        id: "renewal-workflow",
        type: "workflow",
        label: "Renewal workflow",
        summary: "Renews subscriptions every night.",
        sourceIds: ["workflow-definition"],
      },
      {
        id: "billing-capability",
        type: "capability",
        label: "Billing capability",
        summary: "Executes subscription charging for the renewal workflow.",
        sourceIds: ["capability-definition"],
      },
      {
        id: "billing-owner",
        type: "team",
        label: "Revenue team",
        summary: "Owns billing failures and subscription revenue.",
        sourceIds: ["ownership-doc"],
      },
    ],
    edges: [
      {
        source: "product",
        target: "billing-service",
        relation: "charged_by",
        sourceIds: ["product-doc", "billing-code"],
      },
      {
        source: "billing-service",
        target: "subscriptions",
        relation: "writes",
        sourceIds: ["billing-code", "database-schema"],
      },
      {
        source: "renewal-workflow",
        target: "billing-capability",
        relation: "uses",
        sourceIds: ["workflow-definition", "capability-definition"],
      },
      {
        source: "billing-capability",
        target: "billing-service",
        relation: "calls",
        sourceIds: ["capability-definition", "billing-code"],
      },
      {
        source: "billing-owner",
        target: "billing-service",
        relation: "owns",
        sourceIds: ["ownership-doc"],
      },
    ],
  },
  sources: [
    {
      id: "product-doc",
      kind: "repository",
      locator: "docs/product.md",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "Retailers buy the commerce platform as a subscription.",
    },
    {
      id: "billing-code",
      kind: "repository",
      locator: "apps/billing",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "The billing service charges subscriptions.",
    },
    {
      id: "database-schema",
      kind: "crm",
      locator: "mongodb/subscriptions",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "Active subscription state is stored in MongoDB.",
    },
    {
      id: "workflow-definition",
      kind: "workflow",
      locator: "renew-subscriptions",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "The renewal workflow runs nightly.",
    },
    {
      id: "capability-definition",
      kind: "capability",
      locator: "charge-subscription",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "The billing capability performs subscription charging.",
    },
    {
      id: "ownership-doc",
      kind: "repository",
      locator: "docs/ownership.md",
      observedAt: "2026-07-29T10:00:00Z",
      evidence: "The Revenue team owns billing failures.",
    },
  ],
  coverage: [],
  gaps: [],
});

const questions = [
  {
    question: "What product do we sell?",
    requiredNodeId: "product",
    requiredSourceId: "product-doc",
  },
  {
    question: "Where is subscription state stored?",
    requiredNodeId: "subscriptions",
    requiredSourceId: "database-schema",
  },
  {
    question: "Which service charges subscriptions?",
    requiredNodeId: "billing-service",
    requiredSourceId: "billing-code",
  },
  {
    question: "Which workflow renews subscriptions?",
    requiredNodeId: "renewal-workflow",
    requiredSourceId: "workflow-definition",
  },
  {
    question: "Which capability performs subscription charging?",
    requiredNodeId: "billing-capability",
    requiredSourceId: "capability-definition",
  },
  {
    question: "Who owns billing failures?",
    requiredNodeId: "billing-owner",
    requiredSourceId: "ownership-doc",
  },
] as const;

describe("Chat knowledge retrieval ROI", () => {
  it("raises required evidence coverage from zero to all representative questions", () => {
    const index = buildChatKnowledgeIndex(graph);
    const baselineCoveredQuestions = 0;
    const indexedCoveredQuestions = questions.filter((evaluation) => {
      const result = searchChatKnowledge(index, evaluation.question);
      return (
        result.facts.some((fact) => fact.id === evaluation.requiredNodeId) &&
        result.sources.some(
          (source) => source.id === evaluation.requiredSourceId,
        )
      );
    }).length;

    expect({
      baselineEvidenceCoverage: baselineCoveredQuestions / questions.length,
      indexedEvidenceCoverage: indexedCoveredQuestions / questions.length,
    }).toEqual({
      baselineEvidenceCoverage: 0,
      indexedEvidenceCoverage: 1,
    });
  });
});
