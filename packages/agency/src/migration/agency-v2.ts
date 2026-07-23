import {
  createGoalDefinition,
  createGoalState,
  createIntentDefinition,
  createLoopDefinition,
  createLoopState,
  createOperationDefinition,
  createWorkflowDefinition,
  type GoalDefinition,
  type GoalState,
  type IntentDefinition,
  type LoopDefinition,
  type LoopState,
  type OperationDefinition,
  type WorkflowDefinition,
} from "@kody-ade/agency-domain";

type LegacyIntent = {
  id: string;
  for: string;
  principles?: string[];
  controls?: {
    release?: { approval?: string };
    automation?: {
      maxConcurrentGoals?: number;
      maxDailyActions?: number;
      requiresHumanFor?: string[];
    };
  };
};

type LegacyOperation = {
  id: string;
  name: string;
  responsibility: string;
  intentIds: string[];
  goals: string[];
  loops: string[];
};

type LegacyManagedWork = {
  id: string;
  model: "goal" | "loop";
  destination: { outcome: string; evidence: string[] };
  route: Array<{
    stage: string;
    capability: string;
    args?: Record<string, unknown>;
  }>;
  capabilities?: string[];
  schedule?: string;
  workflowRef?: { id: string };
  loopTarget?: { type: "goal" | "workflow" | "capability"; id: string };
  state?: "inactive" | "active" | "paused" | "done";
  facts?: Record<string, unknown>;
  blockers?: string[];
  updatedAt?: string;
  scheduleState?: {
    lastGoalTickAt?: string;
    capabilities?: Record<
      string,
      { lastFiredAt?: string; nextEligibleAt?: string }
    >;
  };
};

type LegacyWorkflow = {
  id: string;
  capabilities: string[];
  steps?: Array<{
    id: string;
    capability: string;
    inputs?: Record<string, { from: string }>;
    next?: Array<{
      to: string;
      when?: Record<string, unknown>;
      default?: boolean;
      maxIterations?: number;
    }>;
  }>;
};

export type AgencyV2MigrationInput = {
  tenantId: string;
  intents: LegacyIntent[];
  operations: LegacyOperation[];
  managedWork: LegacyManagedWork[];
  workflows?: LegacyWorkflow[];
};

export type AgencyV2MigrationPlan = {
  definitions: {
    intents: IntentDefinition[];
    operations: OperationDefinition[];
    goals: GoalDefinition[];
    loops: LoopDefinition[];
    workflows: WorkflowDefinition[];
  };
  states: { goals: GoalState[]; loops: LoopState[] };
  requiredCapabilityIds: string[];
  issues: string[];
};

export function planAgencyV2Migration(
  input: AgencyV2MigrationInput,
): AgencyV2MigrationPlan {
  const issues: string[] = [];
  const intents = input.intents.map((intent) =>
    createIntentDefinition({
      id: intent.id,
      direction: intent.for,
      priorities: intent.principles ?? [],
      policy: legacyPolicy(intent),
      constraints: (intent.controls?.automation?.requiresHumanFor ?? []).map(
        (action, index) => ({
          id: `${intent.id}-approval-${index + 1}`,
          rule: `Require approval for ${action}`,
          actions: [action],
          effect: "require-approval" as const,
        }),
      ),
    }),
  );
  const intentIds = new Set(intents.map((intent) => intent.id));
  const operations = input.operations.flatMap((operation) => {
    const missing = operation.intentIds.filter((id) => !intentIds.has(id));
    if (missing.length > 0) {
      issues.push(
        `Operation "${operation.id}" references missing Intents: ${missing.join(", ")}`,
      );
      return [];
    }
    return [
      createOperationDefinition({
        id: operation.id,
        name: operation.name,
        responsibility: operation.responsibility,
        intentIds: operation.intentIds,
      }),
    ];
  });

  const owners = ownershipMap(input.operations, issues);
  const workflows: WorkflowDefinition[] = [];
  const goals: GoalDefinition[] = [];
  const loops: LoopDefinition[] = [];
  const goalStates: GoalState[] = [];
  const loopStates: LoopState[] = [];
  const capabilityIds = new Set<string>();

  for (const workflow of input.workflows ?? []) {
    const migrated = migrateWorkflow(workflow, issues);
    if (!migrated) continue;
    workflows.push(migrated);
    for (const step of migrated.steps) capabilityIds.add(step.capabilityRef.id);
  }

  for (const work of input.managedWork) {
    const operationId = owners.get(`${work.model}:${work.id}`);
    if (!operationId) {
      issues.push(`${label(work.model)} "${work.id}" has no Operation owner`);
      continue;
    }
    const generatedWorkflow = workflowFromLegacyWork(work);
    if (generatedWorkflow) {
      workflows.push(generatedWorkflow);
      for (const step of generatedWorkflow.steps) capabilityIds.add(step.capabilityRef.id);
    }
    if (work.model === "goal") {
      const executionRef = work.workflowRef
        ? { kind: "workflow" as const, id: work.workflowRef.id }
        : generatedWorkflow
          ? { kind: "workflow" as const, id: generatedWorkflow.id }
          : (work.capabilities ?? []).length === 1
            ? { kind: "capability" as const, id: work.capabilities![0]! }
          : undefined;
      if (!executionRef) {
        issues.push(`Goal "${work.id}" has no Workflow or Capability execution target`);
        continue;
      }
      if (executionRef.kind === "capability") capabilityIds.add(executionRef.id);
      goals.push(
        createGoalDefinition({
          id: work.id,
          operationId,
          objective: objective(input.tenantId, work),
          executionRef,
        }),
      );
      goalStates.push(migrateGoalState(work));
      continue;
    }
    const targetRef = work.loopTarget
      ? { kind: work.loopTarget.type, id: work.loopTarget.id }
      : work.workflowRef
        ? { kind: "workflow" as const, id: work.workflowRef.id }
        : generatedWorkflow
          ? { kind: "workflow" as const, id: generatedWorkflow.id }
          : (work.capabilities ?? []).length === 1
            ? { kind: "capability" as const, id: work.capabilities![0]! }
          : undefined;
    if (!targetRef) {
      issues.push(`Loop "${work.id}" has no Goal, Workflow, or Capability target`);
      continue;
    }
    if (targetRef.kind === "capability") capabilityIds.add(targetRef.id);
    loops.push(
      createLoopDefinition({
        id: work.id,
        operationId,
        objective: objective(input.tenantId, work),
        trigger:
          !work.schedule || work.schedule === "manual"
            ? { type: "manual" }
            : { type: "schedule", every: work.schedule },
        targetRef,
      reconciliationPolicy: {
        overlap: "skip",
        missed: "coalesce",
        failure: { maxAttempts: 3, backoffSeconds: 30, timeoutSeconds: 900 },
      },
      }),
    );
    loopStates.push(migrateLoopState(work));
  }

  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  for (const goal of goals) {
    if (goal.executionRef.kind === "workflow" && !workflowIds.has(goal.executionRef.id)) {
      issues.push(
        `Goal "${goal.id}" references missing Workflow "${goal.executionRef.id}"`,
      );
    }
  }
  for (const loop of loops) {
    if (loop.targetRef.kind === "workflow" && !workflowIds.has(loop.targetRef.id)) {
      issues.push(
        `Loop "${loop.id}" references missing Workflow "${loop.targetRef.id}"`,
      );
    }
  }

  return {
    definitions: { intents, operations, goals, loops, workflows },
    states: { goals: goalStates, loops: loopStates },
    requiredCapabilityIds: [...capabilityIds].sort(),
    issues,
  };
}

function migrateGoalState(work: LegacyManagedWork): GoalState {
  const evidence = work.destination.evidence;
  const satisfied = evidence.filter((key) => work.facts?.[key] === true).length;
  return createGoalState({
    definitionId: work.id,
    lifecycle: legacyLifecycle(work.state),
    progress: evidence.length === 0 ? 1 : satisfied / evidence.length,
    blockers: work.blockers ?? [],
    updatedAt: validTimestamp(work.updatedAt),
  });
}

function migrateLoopState(work: LegacyManagedWork): LoopState {
  const capabilityStates = Object.values(work.scheduleState?.capabilities ?? {});
  const lastFiredAt = latestTimestamp([
    work.scheduleState?.lastGoalTickAt,
    ...capabilityStates.map((state) => state.lastFiredAt),
  ]);
  const nextEligibleAt = earliestTimestamp(
    capabilityStates.map((state) => state.nextEligibleAt),
  );
  const blockers = work.blockers ?? [];
  return createLoopState({
    definitionId: work.id,
    lifecycle: legacyLifecycle(work.state),
    health: blockers.length > 0 ? "failing" : "unknown",
    failures: blockers.length > 0 ? 1 : 0,
    ...(lastFiredAt ? { lastFiredAt } : {}),
    ...(nextEligibleAt ? { nextEligibleAt } : {}),
    updatedAt: validTimestamp(work.updatedAt),
  });
}

function legacyLifecycle(state: LegacyManagedWork["state"]) {
  if (state === "active") return "active" as const;
  if (state === "paused") return "paused" as const;
  if (state === "done") return "retired" as const;
  return "draft" as const;
}

function validTimestamp(value?: string): string {
  return value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

function latestTimestamp(values: Array<string | undefined>): string | undefined {
  return sortedTimestamps(values).at(-1);
}

function earliestTimestamp(values: Array<string | undefined>): string | undefined {
  return sortedTimestamps(values)[0];
}

function sortedTimestamps(values: Array<string | undefined>): string[] {
  return values
    .filter((value): value is string => !!value && !Number.isNaN(Date.parse(value)))
    .map((value) => new Date(value).toISOString())
    .sort();
}

function migrateWorkflow(
  workflow: LegacyWorkflow,
  issues: string[],
): WorkflowDefinition | undefined {
  const sourceSteps: NonNullable<LegacyWorkflow["steps"]> =
    workflow.steps && workflow.steps.length > 0
      ? workflow.steps
      : workflow.capabilities.map((capability, index) => ({
          id: `step-${index + 1}`,
          capability,
          next:
            index + 1 < workflow.capabilities.length
              ? [{ to: `step-${index + 2}`, default: true }]
              : [],
        }));
  const ids = new Set(sourceSteps.map((step) => step.id));
  const dependencies = new Map(sourceSteps.map((step) => [step.id, [] as string[]]));
  const hasExplicitTransitions = sourceSteps.some(
    (step) => (step.next ?? []).length > 0,
  );
  const hasConditionalTransitions = sourceSteps.some((step) =>
    (step.next ?? []).some(
      (transition) =>
        transition.when !== undefined ||
        ((step.next?.length ?? 0) > 1 && transition.default === true),
    ),
  );
  if (hasConditionalTransitions) {
    issues.push(
      `Workflow "${workflow.id}" contains conditional transitions and requires manual V2 redesign`,
    );
    return undefined;
  }
  if (!hasExplicitTransitions) {
    for (let index = 1; index < sourceSteps.length; index += 1) {
      dependencies.get(sourceSteps[index]!.id)!.push(sourceSteps[index - 1]!.id);
    }
  }
  for (const step of sourceSteps) {
    for (const transition of step.next ?? []) {
      if (!ids.has(transition.to)) {
        issues.push(
          `Workflow "${workflow.id}" step "${step.id}" targets missing step "${transition.to}"`,
        );
        return undefined;
      }
      if (transition.maxIterations !== undefined) {
        issues.push(
          `Workflow "${workflow.id}" contains a loop and requires manual V2 redesign`,
        );
        return undefined;
      }
      dependencies.get(transition.to)!.push(step.id);
    }
  }
  if (hasCycle(sourceSteps.map((step) => step.id), dependencies)) {
    issues.push(`Workflow "${workflow.id}" contains a cycle and requires manual V2 redesign`);
    return undefined;
  }
  return createWorkflowDefinition({
    id: workflow.id,
    steps: sourceSteps.map((step) => ({
      id: step.id,
      capabilityRef: { kind: "capability", id: step.capability },
      dependsOn: dependencies.get(step.id) ?? [],
      ...(step.inputs
        ? {
            input: Object.fromEntries(
              Object.entries(step.inputs).map(([key, value]) => [key, { from: value.from }]),
            ),
          }
        : {}),
    })),
  });
}

function hasCycle(ids: string[], dependencies: Map<string, string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((dependencies.get(id) ?? []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return ids.some(visit);
}

function legacyPolicy(intent: LegacyIntent) {
  const automation = intent.controls?.automation;
  const approval = intent.controls?.release?.approval;
  return {
    approval:
      approval === "before-risky-actions" || approval === "before-production"
        ? ("risky-actions" as const)
        : ("none" as const),
    authority: { allow: ["*"], deny: [] },
    budget: {
      maxRuns: Math.max(1, automation?.maxDailyActions ?? 5),
      maxTokens: 100_000,
      maxCostUsd: 100,
      maxDurationSeconds: 3600,
    },
    maxConcurrentRuns: Math.max(1, automation?.maxConcurrentGoals ?? 1),
    riskyActions: automation?.requiresHumanFor ?? [],
  };
}

function ownershipMap(operations: LegacyOperation[], issues: string[]) {
  const owners = new Map<string, string>();
  for (const operation of operations) {
    for (const [model, ids] of [
      ["goal", operation.goals],
      ["loop", operation.loops],
    ] as const) {
      for (const id of ids) {
        const key = `${model}:${id}`;
        const existing = owners.get(key);
        if (existing && existing !== operation.id) {
          issues.push(
            `${label(model)} "${id}" has duplicate Operation owners: ${existing}, ${operation.id}`,
          );
          owners.delete(key);
        } else if (!existing) {
          owners.set(key, operation.id);
        }
      }
    }
  }
  return owners;
}

function workflowFromLegacyWork(work: LegacyManagedWork) {
  const route: LegacyManagedWork["route"] =
    work.route.length > 0
      ? work.route
      : (work.capabilities ?? []).length > 1
        ? (work.capabilities ?? []).map((capability, index) => ({
            stage: `step-${index + 1}`,
            capability,
          }))
        : [];
  if (route.length === 0) return undefined;
  const id = `${work.id}-workflow`;
  return createWorkflowDefinition({
    id,
    steps: route.map((routeStep, index) => ({
      id: routeStep.stage,
      capabilityRef: { kind: "capability", id: routeStep.capability },
      dependsOn: index === 0 ? [] : [route[index - 1]!.stage],
      ...(routeStep.args ? { input: routeStep.args } : {}),
    })),
  });
}

function objective(tenantId: string, work: LegacyManagedWork) {
  return {
    desiredState: work.destination.outcome,
    requiredEvidence: work.destination.evidence,
    scope: { include: { repository: [tenantId] }, exclude: {} },
  };
}

function label(model: "goal" | "loop") {
  return model === "goal" ? "Goal" : "Loop";
}
