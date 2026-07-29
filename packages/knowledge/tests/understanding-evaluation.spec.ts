import { describe, expect, it } from "vitest";
import {
  createKnowledgeContext,
  queryKnowledgeGraph,
  type KnowledgeGraph,
} from "../src";

const evidence = (kind: string, id: string) => [{ kind, id }];

const systemGraph: KnowledgeGraph = {
  schemaVersion: 3,
  generatedAt: "2026-07-29T10:00:00Z",
  nodes: [
    {
      id: "company:acme",
      label: "Acme",
      type: "company",
      domain: "company",
      summary: "Owns the Widgets product.",
      sources: evidence("docs", "README.md"),
    },
    {
      id: "business:subscription",
      label: "Subscription",
      type: "business_concept",
      domain: "business",
      summary: "A paid customer agreement.",
      sources: evidence("docs", "docs/billing.md#subscription"),
    },
    {
      id: "data:subscriptions",
      label: "subscriptions",
      type: "collection",
      domain: "data",
      summary: "Stores subscription state.",
      sources: evidence("cms", "subscriptions"),
    },
    {
      id: "technology:billing",
      label: "Billing service",
      type: "service",
      domain: "technology",
      summary: "Writes subscription state.",
      sources: evidence("github", "apps/billing"),
    },
    {
      id: "work:issue:42",
      label: "#42 Retry failed payments",
      type: "issue",
      domain: "work",
      summary: "Adds bounded payment retries.",
      sources: evidence("github", "issues/42"),
    },
    {
      id: "agency:workflow:delivery",
      label: "Delivery",
      type: "workflow",
      domain: "agency",
      summary: "Builds and delivers reviewed changes.",
      sources: evidence("kody", "workflows/delivery"),
    },
    {
      id: "agency:capability:ship",
      label: "Ship feature",
      type: "capability",
      domain: "agency",
      summary: "Implements and verifies a feature.",
      sources: evidence("kody", "capabilities/ship"),
    },
    {
      id: "business:retry-constraint",
      label: "Retry constraint",
      type: "decision",
      domain: "business",
      summary: "Payment retries stop after three attempts.",
      sources: evidence("docs", "docs/billing.md#retry-constraint"),
    },
  ],
  edges: [
    {
      source: "company:acme",
      relation: "owns",
      target: "business:subscription",
      sources: evidence("docs", "README.md"),
    },
    {
      source: "business:subscription",
      relation: "stored-in",
      target: "data:subscriptions",
      sources: evidence("cms", "subscriptions"),
    },
    {
      source: "technology:billing",
      relation: "writes",
      target: "data:subscriptions",
      sources: evidence("github", "apps/billing/repository.ts"),
    },
    {
      source: "work:issue:42",
      relation: "changes",
      target: "technology:billing",
      sources: evidence("github", "issues/42"),
    },
    {
      source: "agency:workflow:delivery",
      relation: "uses",
      target: "agency:capability:ship",
      sources: evidence("kody", "workflows/delivery"),
    },
    {
      source: "business:retry-constraint",
      relation: "governs",
      target: "technology:billing",
      sources: evidence("docs", "docs/billing.md#retry-constraint"),
    },
  ],
};

const evaluations = [
  {
    question: "where is subscription state stored",
    subject: "data:subscriptions",
    relation: "stored-in",
  },
  {
    question: "which service writes subscriptions",
    subject: "technology:billing",
    relation: "writes",
  },
  {
    question: "what issue changes billing",
    subject: "work:issue:42",
    relation: "changes",
  },
  {
    question: "which workflow ships a feature",
    subject: "agency:capability:ship",
    relation: "uses",
  },
  {
    question: "what limits payment retries",
    subject: "business:retry-constraint",
    relation: "governs",
  },
] as const;

describe("agent understanding evaluation", () => {
  for (const evaluation of evaluations) {
    it(`grounds: ${evaluation.question}`, () => {
      const context = createKnowledgeContext(
        queryKnowledgeGraph(systemGraph, {
          search: evaluation.question,
          depth: 1,
          limit: 20,
        }),
      );

      expect(context.facts.map((fact) => fact.id)).toContain(
        evaluation.subject,
      );
      expect(context.relationships.map((edge) => edge.relation)).toContain(
        evaluation.relation,
      );
      expect(context.sources.length).toBeGreaterThan(0);
      expect(context.gaps).toEqual([]);
    });
  }

  it("abstains when the system has no evidence", () => {
    const context = createKnowledgeContext(
      queryKnowledgeGraph(systemGraph, { search: "employee payroll" }),
    );

    expect(context.subject).toBeNull();
    expect(context.gaps).toEqual([
      'No knowledge matched "employee payroll".',
    ]);
  });
});
