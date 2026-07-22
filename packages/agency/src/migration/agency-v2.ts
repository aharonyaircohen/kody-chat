import {
  createGoalDefinition,
  createIntentDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createWorkflowDefinition,
  type GoalDefinition,
  type IntentDefinition,
  type LoopDefinition,
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
  schedule?: string;
  workflowRef?: { id: string };
  loopTarget?: { type: "goal" | "workflow" | "capability"; id: string };
};

export type AgencyV2MigrationInput = {
  tenantId: string;
  intents: LegacyIntent[];
  operations: LegacyOperation[];
  managedWork: LegacyManagedWork[];
};

export type AgencyV2MigrationPlan = {
  definitions: {
    intents: IntentDefinition[];
    operations: OperationDefinition[];
    goals: GoalDefinition[];
    loops: LoopDefinition[];
    workflows: WorkflowDefinition[];
  };
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
  const capabilityIds = new Set<string>();

  for (const work of input.managedWork) {
    const operationId = owners.get(`${work.model}:${work.id}`);
    if (!operationId) {
      issues.push(`${label(work.model)} "${work.id}" has no Operation owner`);
      continue;
    }
    const generatedWorkflow = workflowFromRoute(work);
    if (generatedWorkflow) {
      workflows.push(generatedWorkflow);
      for (const step of generatedWorkflow.steps) capabilityIds.add(step.capabilityRef.id);
    }
    if (work.model === "goal") {
      const executionRef = work.workflowRef
        ? { kind: "workflow" as const, id: work.workflowRef.id }
        : generatedWorkflow
          ? { kind: "workflow" as const, id: generatedWorkflow.id }
          : undefined;
      if (!executionRef) {
        issues.push(`Goal "${work.id}" has no Workflow or Capability execution target`);
        continue;
      }
      goals.push(
        createGoalDefinition({
          id: work.id,
          operationId,
          objective: objective(input.tenantId, work),
          executionRef,
        }),
      );
      continue;
    }
    const targetRef = work.loopTarget
      ? { kind: work.loopTarget.type, id: work.loopTarget.id }
      : work.workflowRef
        ? { kind: "workflow" as const, id: work.workflowRef.id }
        : generatedWorkflow
          ? { kind: "workflow" as const, id: generatedWorkflow.id }
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
        reconciliationPolicy: { overlap: "skip", missed: "coalesce" },
      }),
    );
  }

  return {
    definitions: { intents, operations, goals, loops, workflows },
    requiredCapabilityIds: [...capabilityIds].sort(),
    issues,
  };
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

function workflowFromRoute(work: LegacyManagedWork) {
  if (work.route.length === 0) return undefined;
  const id = `${work.id}-workflow`;
  return createWorkflowDefinition({
    id,
    steps: work.route.map((route, index) => ({
      id: route.stage,
      capabilityRef: { kind: "capability", id: route.capability },
      dependsOn: index === 0 ? [] : [work.route[index - 1]!.stage],
      ...(route.args ? { input: route.args } : {}),
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
