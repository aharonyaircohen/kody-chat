import { describe, expect, it } from "vitest";
import {
  createCapabilityDefinition,
  createGoalDefinition,
  createGoalState,
  createLoopDefinition,
  createRun,
  createRunOutput,
  relationshipIssues,
} from "../src/index";

const objective = {
  desiredState: "The knowledge graph is current",
  requiredEvidence: ["graph-published"],
  scope: { include: { repository: ["acme/app"] }, exclude: {} },
};

describe("clean AI Agency domain", () => {
  it("contains no persistence version or storage metadata", () => {
    expect(() =>
      createGoalDefinition({
        id: "refresh-graph",
        operationId: "knowledge",
        objective,
        executionRef: { kind: "workflow", id: "refresh-knowledge" },
        version: 2,
      }),
    ).toThrow(/unknown field "version"/i);
  });

  it("keeps schedules out of Goals and steps out of Capabilities", () => {
    expect(() =>
      createGoalDefinition({
        id: "refresh-graph",
        operationId: "knowledge",
        objective,
        executionRef: { kind: "workflow", id: "refresh-knowledge" },
        trigger: { type: "schedule", every: "1h" },
      }),
    ).toThrow(/trigger/);
    expect(() =>
      createCapabilityDefinition({
        id: "build-knowledge-graph",
        action: "Build a knowledge graph",
        input: "repository",
        output: "graph",
        steps: ["extract", "publish"],
      }),
    ).toThrow(/steps/);
  });

  it("keeps Trigger and target inside Loop", () => {
    expect(
      createLoopDefinition({
        id: "knowledge-refresh",
        operationId: "knowledge",
        objective,
        trigger: { type: "schedule", every: "1h" },
        targetRef: { kind: "workflow", id: "refresh-knowledge" },
      reconciliationPolicy: {
        overlap: "skip",
        missed: "coalesce",
        failure: { maxAttempts: 3, backoffSeconds: 30, timeoutSeconds: 900 },
      },
      }),
    ).toMatchObject({ id: "knowledge-refresh" });
  });

  it("keeps mutable State separate from Definition", () => {
    expect(
      createGoalState({
        definitionId: "refresh-graph",
        lifecycle: "active",
        progress: 0,
        blockers: [],
        updatedAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toMatchObject({ progress: 0 });
    expect(() =>
      createGoalState({
        definitionId: "refresh-graph",
        lifecycle: "active",
        progress: 0,
        blockers: [],
        objective,
        updatedAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toThrow(/objective/);
  });

  it("freezes terminal Runs and requires provenance on outputs", () => {
    const run = createRun({
      id: "run-1",
      status: "succeeded",
      origin: { kind: "loop", id: "knowledge-refresh", revision: "loop-ref" },
      target: { kind: "workflow", id: "refresh-knowledge", revision: "workflow-ref" },
      trace: [
        { kind: "loop", id: "knowledge-refresh", revision: "loop-ref" },
        { kind: "workflow", id: "refresh-knowledge", revision: "workflow-ref" },
      ],
      effectivePolicy: {
        hash: "policy-hash",
        policy: {
          approval: "none",
          authority: { allow: ["refresh-knowledge"], deny: [] },
          budget: {
            maxRuns: 1,
            maxTokens: 1000,
            maxCostUsd: 10,
            maxDurationSeconds: 300,
          },
          maxConcurrentRuns: 1,
          riskyActions: [],
        },
        constraints: [],
      },
      correlationId: "corr-1",
      startedAt: "2026-07-22T00:00:00.000Z",
      finishedAt: "2026-07-22T00:01:00.000Z",
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(() =>
      createRunOutput({
        kind: "evidence",
        key: "graph-published",
        value: true,
      }),
    ).toThrow(/runId/);
  });

  it("reports unresolved ownership and targets", () => {
    const goal = createGoalDefinition({
      id: "refresh-graph",
      operationId: "missing-operation",
      objective,
      executionRef: { kind: "workflow", id: "missing-workflow" },
    });
    expect(
      relationshipIssues(goal, {
        operations: [],
        goals: [],
        workflows: [],
        capabilities: [],
      }),
    ).toEqual([
      'Missing Operation "missing-operation"',
      'Missing Workflow "missing-workflow"',
    ]);
  });

  it("uses typed scope and rejects unbounded arbitrary fields", () => {
    expect(() =>
      createGoalDefinition({
        id: "refresh-graph",
        operationId: "knowledge",
        objective: {
          ...objective,
          scope: { repository: "acme/app" },
        },
        executionRef: { kind: "workflow", id: "refresh-knowledge" },
      }),
    ).toThrow(/unknown field "repository"/i);
  });
});
