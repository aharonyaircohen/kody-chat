import { describe, expect, it } from "vitest";
import {
  createCapabilityDefinition,
  createImplementationDefinition,
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
  it("separates the canonical capability contract from its execution model", () => {
    const capability = createCapabilityDefinition({
      id: "build-knowledge-graph",
      action: "Build a knowledge graph",
      purpose: "Produce a current project knowledge graph",
      inputSchema: {
        type: "object",
        required: ["repository"],
        properties: { repository: { type: "string" } },
      },
      outputSchema: {
        type: "object",
        required: ["graph"],
        properties: { graph: { type: "object" } },
      },
      effects: ["artifact.write"],
      permissions: ["repository.read"],
      success: "A valid graph artifact is produced",
      failure: "No graph artifact is published",
    });
    const implementation = createImplementationDefinition({
      id: "graphify-knowledge-graph",
      capabilityRef: {
        kind: "capability",
        id: "build-knowledge-graph",
      },
      compatibleCapabilityRevision: "contract-hash",
      type: "agent",
      agentRef: { kind: "agent", id: "knowledge-engineer" },
    });

    expect(capability).toMatchObject({ id: "build-knowledge-graph" });
    expect(implementation).toMatchObject({
      type: "agent",
      capabilityRef: { id: "build-knowledge-graph" },
    });
    expect(implementation).not.toHaveProperty("prompt");
    expect(implementation).not.toHaveProperty("model");
    expect(implementation).not.toHaveProperty("tools");
  });

  it("requires an agent only for agent implementations", () => {
    expect(() =>
      createImplementationDefinition({
        id: "run-graph-script",
        capabilityRef: { kind: "capability", id: "build-knowledge-graph" },
        compatibleCapabilityRevision: "contract-hash",
        type: "script",
        agentRef: { kind: "agent", id: "developer" },
      }),
    ).toThrow(/agentRef/);
    expect(() =>
      createImplementationDefinition({
        id: "graphify-knowledge-graph",
        capabilityRef: { kind: "capability", id: "build-knowledge-graph" },
        compatibleCapabilityRevision: "contract-hash",
        type: "agent",
      }),
    ).toThrow(/agentRef/);
  });

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
        purpose: "Produce project knowledge",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        effects: [],
        permissions: [],
        success: "A graph is produced",
        failure: "No graph is produced",
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
    expect(
      createRunOutput({
        kind: "evidence",
        key: "graph-published",
        value: true,
        runId: "run-1",
        producer: { kind: "workflow", id: "refresh-knowledge" },
        parentRef: {
          kind: "goal",
          id: "knowledge-current",
          revision: "goal-revision",
        },
        contract: "capability-result/v1",
        createdAt: "2026-07-22T00:01:00.000Z",
      }),
    ).toMatchObject({
      parentRef: {
        kind: "goal",
        id: "knowledge-current",
        revision: "goal-revision",
      },
    });
  });

  it("pins capability and implementation on execution runs", () => {
    expect(
      createRun({
        id: "run-implementation",
        status: "running",
        origin: { kind: "goal", id: "knowledge-current", revision: "goal-ref" },
        target: {
          kind: "capability",
          id: "build-knowledge-graph",
          revision: "contract-ref",
        },
        execution: {
          capability: {
            kind: "capability",
            id: "build-knowledge-graph",
            revision: "contract-ref",
          },
          implementation: {
            kind: "implementation",
            id: "graphify-knowledge-graph",
            revision: "implementation-ref",
          },
        },
        parentRunId: "run-workflow",
        trace: [
          { kind: "goal", id: "knowledge-current", revision: "goal-ref" },
          {
            kind: "capability",
            id: "build-knowledge-graph",
            revision: "contract-ref",
          },
          {
            kind: "implementation",
            id: "graphify-knowledge-graph",
            revision: "implementation-ref",
          },
        ],
        effectivePolicy: {
          hash: "policy-hash",
          policy: {
            approval: "none",
            authority: { allow: ["repository.read"], deny: [] },
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
        correlationId: "corr-implementation",
        startedAt: "2026-07-22T00:00:00.000Z",
      }),
    ).toMatchObject({
      parentRunId: "run-workflow",
      execution: {
        capability: { id: "build-knowledge-graph" },
        implementation: { id: "graphify-knowledge-graph" },
      },
    });
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
