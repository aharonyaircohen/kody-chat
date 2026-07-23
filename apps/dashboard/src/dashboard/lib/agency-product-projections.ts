import type {
  GoalDefinition,
  GoalState,
  IntentDefinition,
  IntentState,
  LoopDefinition,
  LoopState,
  OperationDefinition,
  OperationState,
  Run,
  RunOutput,
  WorkflowDefinition,
} from "@kody-ade/agency-domain";
import {
  createIntentDefinition,
  createOperationDefinition,
  type Lifecycle,
} from "@kody-ade/agency-domain";
import type {
  CompanyIntent,
  CompanyIntentInput,
  CompanyIntentRecord,
  CompanyIntentStatus,
} from "./company-intents";
import type {
  ManagedGoalRecord,
  ManagedGoalRouteStep,
  ManagedGoalStateValue,
} from "./managed-goals";
import type { OperationRecord } from "./api/operations";
import type { OperationCreateInput } from "./api/operations";
import type {
  AgencyDefinitionRecord,
  AgencyObservations,
  AgencyStateRecord,
} from "./api/agency-model";

export function intentDefinitionFromInput(
  input: CompanyIntentInput & { id: string },
): IntentDefinition {
  const riskyActions = input.controls.automation.requiresHumanFor;
  return createIntentDefinition({
    id: input.id,
    direction: input.for,
    ...(input.description ? { description: input.description } : {}),
    priority: input.priority,
    posture: input.posture,
    scope: {
      include: {
        repository: input.scope.repos,
        area: input.scope.areas,
      },
      exclude: {},
    },
    priorities: input.principles,
    measures: input.metrics,
    policyRefs: input.policyRefs ?? [],
    deliveryPolicy: {
      cadence: input.controls.release?.cadence ?? "manual",
      assurance: input.controls.release?.qaDepth ?? "standard",
      blockerSensitivity: input.controls.release?.blockerLevel ?? "standard",
    },
    policy: {
      approval:
        input.controls.release?.approval === "none" ? "none" : "risky-actions",
      authority: { allow: ["*"], deny: [] },
      budget: {
        maxRuns: input.controls.automation.maxDailyActions,
        maxTokens: 100_000,
        maxCostUsd: 100,
        maxDurationSeconds: 3600,
      },
      maxConcurrentRuns: input.controls.automation.maxConcurrentGoals,
      riskyActions,
    },
    constraints: riskyActions.map((action, index) => ({
      id: `${input.id}-approval-${index + 1}`,
      rule: `Require approval for ${action}`,
      actions: [action],
      effect: "require-approval",
    })),
  });
}

export function intentLifecycle(
  status: CompanyIntentStatus | undefined,
): Lifecycle {
  if (status === "paused") return "paused";
  if (status === "archived") return "archived";
  return "active";
}

export function operationDefinitionFromInput(
  input: OperationCreateInput & { id: string },
): OperationDefinition {
  return createOperationDefinition({
    id: input.id,
    name: input.name,
    responsibility: input.responsibility,
    doesNotOwn: input.doesNotOwn,
    intentIds: input.intentIds,
  });
}

function definitionsOf<T>(
  records: AgencyDefinitionRecord[],
  kind: AgencyDefinitionRecord["kind"],
): T[] {
  return records
    .filter((record) => record.kind === kind)
    .map((record) => record.data as T);
}

function stateFor<T>(
  records: AgencyStateRecord[],
  kind: AgencyStateRecord["kind"],
  definitionId: string,
): T | undefined {
  return records.find(
    (record) => record.kind === kind && record.definitionId === definitionId,
  )?.data as T | undefined;
}

function isArchived(
  records: AgencyStateRecord[],
  kind: AgencyStateRecord["kind"],
  definitionId: string,
): boolean {
  return (
    stateFor<{ lifecycle?: string }>(records, kind, definitionId)?.lifecycle ===
    "archived"
  );
}

function intentStatus(state: IntentState | undefined): CompanyIntentStatus {
  if (state?.lifecycle === "paused") return "paused";
  if (state?.lifecycle === "retired" || state?.lifecycle === "archived") {
    return "archived";
  }
  return "active";
}

function intentPortfolio(
  intentId: string,
  operations: OperationDefinition[],
  goals: GoalDefinition[],
  loops: LoopDefinition[],
  workflows: WorkflowDefinition[],
  states: AgencyStateRecord[],
) {
  const operationIds = new Set(
    operations
      .filter((operation) => operation.intentIds.includes(intentId))
      .map((operation) => operation.id),
  );
  const ownedGoals = goals.filter(
    (goal) =>
      operationIds.has(goal.operationId) &&
      !isArchived(states, "goal", goal.id),
  );
  const ownedLoops = loops.filter(
    (loop) =>
      operationIds.has(loop.operationId) &&
      !isArchived(states, "loop", loop.id),
  );
  const workflowById = new Map(
    workflows.map((workflow) => [workflow.id, workflow]),
  );
  const capabilities = new Set<string>();
  for (const reference of [
    ...ownedGoals.map((goal) => goal.executionRef),
    ...ownedLoops.map((loop) => loop.targetRef),
  ]) {
    if (reference.kind === "capability") capabilities.add(reference.id);
    if (reference.kind === "workflow") {
      for (const step of workflowById.get(reference.id)?.steps ?? []) {
        capabilities.add(step.capabilityRef.id);
      }
    }
  }
  return {
    goals: ownedGoals.map((goal) => goal.id).sort(),
    loops: ownedLoops.map((loop) => loop.id).sort(),
    capabilities: [...capabilities].sort(),
  };
}

export function projectCompanyIntents(
  definitions: AgencyDefinitionRecord[],
  states: AgencyStateRecord[],
  observations?: AgencyObservations,
): CompanyIntentRecord[] {
  const intents = definitionsOf<IntentDefinition>(definitions, "intent").map(
    (definition) => createIntentDefinition(definition),
  );
  const operations = definitionsOf<OperationDefinition>(
    definitions,
    "operation",
  ).map((definition) => createOperationDefinition(definition));
  const goals = definitionsOf<GoalDefinition>(definitions, "goal");
  const loops = definitionsOf<LoopDefinition>(definitions, "loop");
  const workflows = definitionsOf<WorkflowDefinition>(definitions, "workflow");

  return intents
    .map((definition) => {
      const state = stateFor<IntentState>(states, "intent", definition.id);
      const createdAt =
        definitions.find(
          (record) =>
            record.kind === "intent" && record.data.id === definition.id,
        )?.createdAt ??
        state?.updatedAt ??
        new Date(0).toISOString();
      const intent: CompanyIntent = {
        version: 1,
        id: definition.id,
        status: intentStatus(state),
        for: definition.direction,
        ...(definition.description
          ? { description: definition.description }
          : {}),
        priority: definition.priority,
        posture: definition.posture,
        scope: {
          repos: [...(definition.scope.include.repository ?? [])],
          areas: [...(definition.scope.include.area ?? [])],
        },
        principles: [...definition.priorities],
        metrics: [...definition.measures],
        policyRefs: [...definition.policyRefs],
        controls: {
          release: {
            cadence: definition.deliveryPolicy.cadence,
            qaDepth: definition.deliveryPolicy.assurance,
            blockerLevel: definition.deliveryPolicy.blockerSensitivity,
            approval:
              definition.policy.approval === "none"
                ? "none"
                : "before-risky-actions",
          },
          automation: {
            authority: "full-auto",
            maxConcurrentGoals: definition.policy.maxConcurrentRuns,
            maxDailyActions: definition.policy.budget.maxRuns,
            requiresHumanFor: [...definition.policy.riskyActions],
          },
        },
        portfolio: intentPortfolio(
          definition.id,
          operations,
          goals,
          loops,
          workflows,
          states,
        ),
        createdAt,
        updatedAt: state?.updatedAt ?? createdAt,
      };
      return {
        id: definition.id,
        path: `agency-definitions/intent/${definition.id}`,
        intent,
        decisions: intentDecisions(definition.id, observations),
      };
    })
    .sort(
      (left, right) =>
        left.intent.priority - right.intent.priority ||
        left.id.localeCompare(right.id),
    );
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function intentDecisions(
  intentId: string,
  observations: AgencyObservations | undefined,
): CompanyIntentRecord["decisions"] {
  if (!observations) return [];
  const runs = new Map(
    observations.runs
      .map((record) => record.run as Run)
      .filter(
        (run) => run.origin?.kind === "intent" && run.origin.id === intentId,
      )
      .map((run) => [run.id, run]),
  );
  return observations.outputs
    .map((record) => record.data as RunOutput)
    .flatMap((output) => {
      const run = runs.get(output.runId);
      const decision = recordValue(output.value);
      if (
        !run ||
        (output.contract !== "company-intent-decision" &&
          output.key !== "decision") ||
        !decision
      ) {
        return [];
      }
      return [
        {
          at: output.createdAt,
          agent:
            textValue(decision.agent) ??
            (output.producer?.kind === "agent" ? output.producer.id : "Kody"),
          intentId,
          action: textValue(decision.action) ?? run.target.id,
          reason:
            textValue(decision.reason) ?? "Decision recorded by the Agency run",
          ...(decision.before !== undefined ? { before: decision.before } : {}),
          ...(decision.after !== undefined ? { after: decision.after } : {}),
          ...(Array.isArray(decision.resources)
            ? {
                resources: decision.resources.filter(
                  (value): value is string => typeof value === "string",
                ),
              }
            : {}),
        },
      ];
    })
    .sort((left, right) => left.at.localeCompare(right.at));
}

function operationStatus(
  state: OperationState | undefined,
): OperationRecord["operation"]["status"] {
  if (state?.lifecycle === "active") return "active";
  if (state?.lifecycle === "paused") return "paused";
  if (state?.lifecycle === "retired" || state?.lifecycle === "archived") {
    return "retired";
  }
  return "proposed";
}

export function projectOperations(
  definitions: AgencyDefinitionRecord[],
  states: AgencyStateRecord[],
): OperationRecord[] {
  const operations = definitionsOf<OperationDefinition>(
    definitions,
    "operation",
  ).map((definition) => createOperationDefinition(definition));
  const goals = definitionsOf<GoalDefinition>(definitions, "goal");
  const loops = definitionsOf<LoopDefinition>(definitions, "loop");
  const intentIds = new Set(
    definitionsOf<IntentDefinition>(definitions, "intent").map(
      (intent) => intent.id,
    ),
  );
  return operations.flatMap((definition) => {
    const state = stateFor<OperationState>(states, "operation", definition.id);
    if (state?.lifecycle === "archived") return [];
    const createdAt =
      definitions.find(
        (record) =>
          record.kind === "operation" && record.data.id === definition.id,
      )?.createdAt ??
      state?.updatedAt ??
      new Date(0).toISOString();
    const ownedGoals = goals
      .filter(
        (goal) =>
          goal.operationId === definition.id &&
          !isArchived(states, "goal", goal.id),
      )
      .map((goal) => goal.id)
      .sort();
    const ownedLoops = loops
      .filter(
        (loop) =>
          loop.operationId === definition.id &&
          !isArchived(states, "loop", loop.id),
      )
      .map((loop) => loop.id)
      .sort();
    const activationIssues = [
      ...(ownedGoals.length === 0 && ownedLoops.length === 0
        ? ["Operation must own at least one Goal or Loop"]
        : []),
      ...definition.intentIds
        .filter((intentId) => !intentIds.has(intentId))
        .map((intentId) => `Missing Intent "${intentId}"`),
    ];
    return [
      {
        id: definition.id,
        path: `agency-definitions/operation/${definition.id}`,
        sha: "",
        operation: {
          version: 1,
          id: definition.id,
          name: definition.name,
          responsibility: definition.responsibility,
          doesNotOwn: [...definition.doesNotOwn],
          intentIds: [...definition.intentIds],
          goals: ownedGoals,
          loops: ownedLoops,
          status: operationStatus(state),
          createdAt,
          updatedAt: state?.updatedAt ?? createdAt,
        },
        activationIssues,
      },
    ];
  });
}

function managedLifecycle(
  lifecycle: GoalState["lifecycle"] | LoopState["lifecycle"] | undefined,
): ManagedGoalStateValue {
  if (lifecycle === "active") return "active";
  if (lifecycle === "paused") return "paused";
  if (lifecycle === "retired" || lifecycle === "archived") return "done";
  return "inactive";
}

function workflowRoute(
  workflow: WorkflowDefinition | undefined,
  evidence: readonly string[],
): ManagedGoalRouteStep[] {
  return (workflow?.steps ?? []).map((step, index) => ({
    stage: step.id,
    evidence: evidence[index] ?? step.id,
    capability: step.capabilityRef.id,
    ...(step.input ? { args: { ...step.input } } : {}),
  }));
}

export function projectManagedGoals(
  definitions: AgencyDefinitionRecord[],
  states: AgencyStateRecord[],
  observations?: AgencyObservations,
): ManagedGoalRecord[] {
  const goals = definitionsOf<GoalDefinition>(definitions, "goal");
  const loops = definitionsOf<LoopDefinition>(definitions, "loop");
  const workflows = new Map(
    definitionsOf<WorkflowDefinition>(definitions, "workflow").map(
      (workflow) => [workflow.id, workflow],
    ),
  );
  const factsFor = (kind: "goal" | "loop", id: string) => {
    const facts: Record<string, unknown> = {};
    const outputs = (observations?.outputs ?? [])
      .map((record) => record.data as RunOutput)
      .filter(
        (output) =>
          output.parentRef?.kind === kind && output.parentRef.id === id,
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const output of outputs) {
      if (output.kind === "fact" || output.kind === "evidence") {
        facts[output.key] = output.value;
      }
    }
    return facts;
  };
  const projectedGoals = goals.flatMap((definition): ManagedGoalRecord[] => {
    const state = stateFor<GoalState>(states, "goal", definition.id);
    if (state?.lifecycle === "archived") return [];
    const workflow =
      definition.executionRef.kind === "workflow"
        ? workflows.get(definition.executionRef.id)
        : undefined;
    const route = workflowRoute(
      workflow,
      definition.objective.requiredEvidence,
    );
    return [
      {
        id: definition.id,
        path: `agency-definitions/goal/${definition.id}`,
        updatedAt: state?.updatedAt,
        state: {
          version: 1,
          state: managedLifecycle(state?.lifecycle),
          type: "improve",
          destination: {
            outcome: definition.objective.desiredState,
            evidence: [...definition.objective.requiredEvidence],
          },
          capabilities:
            definition.executionRef.kind === "capability"
              ? [definition.executionRef.id]
              : route.map((step) => step.capability),
          route,
          ...(definition.executionRef.kind === "workflow"
            ? { workflowRef: { id: definition.executionRef.id } }
            : {}),
          facts: factsFor("goal", definition.id),
          blockers: [...(state?.blockers ?? [])],
          operationId: definition.operationId,
          progress: state?.progress ?? 0,
        },
      },
    ];
  });
  const projectedLoops = loops.flatMap((definition): ManagedGoalRecord[] => {
    const state = stateFor<LoopState>(states, "loop", definition.id);
    if (state?.lifecycle === "archived") return [];
    const workflow =
      definition.targetRef.kind === "workflow"
        ? workflows.get(definition.targetRef.id)
        : undefined;
    const route = workflowRoute(
      workflow,
      definition.objective.requiredEvidence,
    );
    return [
      {
        id: definition.id,
        path: `agency-definitions/loop/${definition.id}`,
        updatedAt: state?.updatedAt,
        state: {
          version: 1,
          state: managedLifecycle(state?.lifecycle),
          type: "agentLoop",
          destination: {
            outcome: definition.objective.desiredState,
            evidence: [...definition.objective.requiredEvidence],
          },
          capabilities:
            definition.targetRef.kind === "capability"
              ? [definition.targetRef.id]
              : route.map((step) => step.capability),
          route,
          schedule:
            definition.trigger.type === "schedule"
              ? (definition.trigger
                  .every as ManagedGoalRecord["state"]["schedule"])
              : "manual",
          ...(definition.trigger.type === "schedule" && definition.trigger.at
            ? { preferredRunTime: definition.trigger.at }
            : {}),
          scheduleMode: "agentLoop",
          loopTarget: {
            type: definition.targetRef.kind,
            id: definition.targetRef.id,
          },
          ...(definition.targetRef.kind === "workflow"
            ? { workflowRef: { id: definition.targetRef.id } }
            : {}),
          facts: factsFor("loop", definition.id),
          blockers: [],
          operationId: definition.operationId,
          health: state?.health ?? "unknown",
          failures: state?.failures ?? 0,
          ...(state?.lastFiredAt ? { lastFiredAt: state.lastFiredAt } : {}),
          ...(state?.nextEligibleAt
            ? { nextEligibleAt: state.nextEligibleAt }
            : {}),
        },
      },
    ];
  });
  return [...projectedGoals, ...projectedLoops].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
