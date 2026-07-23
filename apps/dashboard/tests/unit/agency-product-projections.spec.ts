import { describe, expect, it } from "vitest";
import {
  projectCompanyIntents,
  projectManagedGoals,
  projectOperations,
} from "../../src/dashboard/lib/agency-product-projections";
import type {
  AgencyDefinitionRecord,
  AgencyObservations,
  AgencyStateRecord,
} from "../../src/dashboard/lib/api/agency-model";

const createdAt = "2026-07-23T00:00:00.000Z";
const policy = {
  approval: "risky-actions" as const,
  authority: { allow: ["*"], deny: [] },
  budget: {
    maxRuns: 5,
    maxTokens: 1000,
    maxCostUsd: 10,
    maxDurationSeconds: 300,
  },
  maxConcurrentRuns: 1,
  riskyActions: ["production"],
};

const definitions: AgencyDefinitionRecord[] = [
  {
    recordId: "intent:growth:1",
    kind: "intent",
    schemaVersion: 1,
    createdAt,
    data: {
      id: "growth",
      direction: "Grow sustainably",
      priority: 1,
      posture: "balanced",
      scope: {
        include: { repository: ["acme/app"], area: ["growth"] },
        exclude: {},
      },
      priorities: ["Measure outcomes"],
      measures: ["Qualified leads"],
      policyRefs: [],
      deliveryPolicy: {
        cadence: "1w",
        assurance: "strict",
        blockerSensitivity: "standard",
      },
      policy,
      constraints: [],
    },
  },
  {
    recordId: "operation:growth:1",
    kind: "operation",
    schemaVersion: 1,
    createdAt,
    data: {
      id: "growth-operation",
      name: "Growth",
      responsibility: "Own company growth",
      doesNotOwn: ["Product delivery"],
      intentIds: ["growth"],
    },
  },
  {
    recordId: "goal:launch:1",
    kind: "goal",
    schemaVersion: 1,
    createdAt,
    data: {
      id: "launch",
      operationId: "growth-operation",
      objective: {
        desiredState: "Campaign launched",
        requiredEvidence: ["campaign-live"],
        scope: { include: {}, exclude: {} },
      },
      executionRef: { kind: "capability", id: "publish-campaign" },
    },
  },
  {
    recordId: "loop:health:1",
    kind: "loop",
    schemaVersion: 1,
    createdAt,
    data: {
      id: "growth-health",
      operationId: "growth-operation",
      objective: {
        desiredState: "Growth stays healthy",
        requiredEvidence: ["health-report"],
        scope: { include: {}, exclude: {} },
      },
      trigger: { type: "schedule", every: "1h" },
      targetRef: { kind: "capability", id: "measure-growth" },
      reconciliationPolicy: {
        overlap: "skip",
        missed: "coalesce",
        failure: {
          maxAttempts: 3,
          backoffSeconds: 30,
          timeoutSeconds: 900,
        },
      },
    },
  },
];

const states: AgencyStateRecord[] = [
  {
    definitionId: "growth",
    kind: "intent",
    schemaVersion: 1,
    data: { definitionId: "growth", lifecycle: "active", updatedAt: createdAt },
    updatedAt: createdAt,
  },
  {
    definitionId: "growth-operation",
    kind: "operation",
    schemaVersion: 1,
    data: {
      definitionId: "growth-operation",
      lifecycle: "active",
      updatedAt: createdAt,
    },
    updatedAt: createdAt,
  },
  {
    definitionId: "launch",
    kind: "goal",
    schemaVersion: 1,
    data: {
      definitionId: "launch",
      lifecycle: "active",
      progress: 0.5,
      blockers: [],
      updatedAt: createdAt,
    },
    updatedAt: createdAt,
  },
  {
    definitionId: "growth-health",
    kind: "loop",
    schemaVersion: 1,
    data: {
      definitionId: "growth-health",
      lifecycle: "active",
      health: "healthy",
      failures: 0,
      updatedAt: createdAt,
    },
    updatedAt: createdAt,
  },
];

const observations: AgencyObservations = {
  runs: [
    {
      runId: "intent-run",
      subjectType: "capability",
      subjectId: "review-company",
      updatedAt: createdAt,
      run: {
        id: "intent-run",
        status: "succeeded",
        origin: { kind: "intent", id: "growth", revision: "1" },
        target: { kind: "capability", id: "review-company", revision: "1" },
        trace: [],
        effectivePolicy: { hash: "policy", policy, constraints: [] },
        correlationId: "intent-correlation",
        startedAt: createdAt,
        finishedAt: createdAt,
      },
    },
  ],
  outputs: [
    {
      recordId: "output:campaign-live",
      runId: "goal-run",
      schemaVersion: 1,
      data: {
        kind: "evidence",
        key: "campaign-live",
        value: true,
        runId: "goal-run",
        producer: { kind: "capability", id: "publish-campaign" },
        parentRef: { kind: "goal", id: "launch", revision: "1" },
        contract: "campaign",
        createdAt,
      },
    },
    {
      recordId: "output:intent-decision",
      runId: "intent-run",
      schemaVersion: 1,
      data: {
        kind: "artifact",
        key: "decision",
        value: {
          action: "continue",
          reason: "Qualified leads are improving",
          agent: "cto",
        },
        runId: "intent-run",
        producer: { kind: "agent", id: "cto" },
        contract: "company-intent-decision",
        createdAt,
      },
    },
  ],
};

describe("agency product projections", () => {
  it("keeps mature UI records derived from the new model only", () => {
    const intents = projectCompanyIntents(definitions, states, observations);
    const operations = projectOperations(definitions, states);
    const managed = projectManagedGoals(definitions, states, observations);

    expect(intents[0]?.intent).toMatchObject({
      for: "Grow sustainably",
      status: "active",
      portfolio: {
        goals: ["launch"],
        loops: ["growth-health"],
        capabilities: ["measure-growth", "publish-campaign"],
      },
    });
    expect(intents[0]?.decisions).toEqual([
      expect.objectContaining({
        action: "continue",
        reason: "Qualified leads are improving",
        agent: "cto",
      }),
    ]);
    expect(operations[0]?.operation).toMatchObject({
      doesNotOwn: ["Product delivery"],
      goals: ["launch"],
      loops: ["growth-health"],
      status: "active",
    });
    expect(managed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "launch",
          state: expect.objectContaining({
            state: "active",
            operationId: "growth-operation",
            progress: 0.5,
            facts: { "campaign-live": true },
          }),
        }),
        expect.objectContaining({
          id: "growth-health",
          state: expect.objectContaining({
            scheduleMode: "agentLoop",
            loopTarget: { type: "capability", id: "measure-growth" },
            health: "healthy",
          }),
        }),
      ]),
    );
  });

  it("derives Operation activation issues from new model relationships", () => {
    const operation = projectOperations(
      definitions.filter(
        (record) =>
          record.kind !== "intent" &&
          record.kind !== "goal" &&
          record.kind !== "loop",
      ),
      states,
    )[0];

    expect(operation?.activationIssues).toEqual([
      "Operation must own at least one Goal or Loop",
      'Missing Intent "growth"',
    ]);
  });

  it("keeps archived Goals and Loops out of the current portfolio", () => {
    const archivedStates = states.map((record) =>
      record.kind === "goal" || record.kind === "loop"
        ? {
            ...record,
            data: {
              ...record.data,
              lifecycle: "archived" as const,
            },
          }
        : record,
    );

    expect(
      projectOperations(definitions, archivedStates)[0]?.operation,
    ).toMatchObject({
      goals: [],
      loops: [],
    });
    expect(
      projectCompanyIntents(definitions, archivedStates)[0]?.intent.portfolio,
    ).toMatchObject({
      goals: [],
      loops: [],
      capabilities: [],
    });
    expect(projectManagedGoals(definitions, archivedStates)).toEqual([]);
  });

  it("keeps the UI readable while older stored records are upgraded", () => {
    const olderDefinitions = definitions.map((record) =>
      record.kind === "operation"
        ? {
            ...record,
            data: {
              id: "growth-operation",
              name: "Growth",
              responsibility: "Own company growth",
              intentIds: ["growth"],
            },
          }
        : record,
    ) as AgencyDefinitionRecord[];
    const olderObservations = {
      runs: [
        {
          ...observations.runs[0],
          run: {
            id: "older-run",
            status: "succeeded",
            target: {
              kind: "capability",
              id: "review-company",
              revision: "1",
            },
            trace: [],
            effectivePolicy: {
              hash: "policy",
              policy,
              constraints: [],
            },
            correlationId: "older-correlation",
            startedAt: createdAt,
            finishedAt: createdAt,
          },
        },
      ],
      outputs: observations.outputs,
    } as unknown as AgencyObservations;

    expect(
      projectOperations(olderDefinitions, states)[0]?.operation.doesNotOwn,
    ).toEqual([]);
    expect(
      projectCompanyIntents(olderDefinitions, states, olderObservations)[0]
        ?.decisions,
    ).toEqual([]);
  });
});
