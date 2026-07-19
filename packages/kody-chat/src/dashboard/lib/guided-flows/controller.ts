export type GuidedFlowStatus = "active" | "completed" | "cancelled";

export interface GuidedFlowTransitionMap {
  readonly [actionId: string]: string;
}

export interface GuidedFlowStepDefinition {
  readonly id: string;
  readonly title: string;
  readonly explanation: string;
  readonly rendererSlug: string;
  readonly rendererData?: Readonly<Record<string, unknown>>;
  readonly authoringGoal?: string;
  readonly routeId?: string;
  readonly transitions?: GuidedFlowTransitionMap;
  readonly allowedActions?: readonly string[];
}

export interface GuidedFlowDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly steps: readonly GuidedFlowStepDefinition[];
  readonly completionRouteId?: string;
}

export interface GuidedFlowInstance {
  readonly instanceId: string;
  readonly instanceKey?: string;
  readonly flowId: string;
  readonly flowVersion: number;
  readonly currentStepId: string;
  readonly status: GuidedFlowStatus;
  readonly revision: number;
  readonly data: Readonly<Record<string, unknown>>;
  readonly history: readonly string[];
}

export interface GuidedFlowSubmit {
  readonly actionId: string;
  readonly result?: Readonly<Record<string, unknown>>;
}

const SENSITIVE_DATA_KEY = /(password|secret|token|api.?key|private.?key)/i;

function sanitizeResultValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeResultValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nested]) =>
      SENSITIVE_DATA_KEY.test(key) ? [] : [[key, sanitizeResultValue(nested)]],
    ),
  );
}

function sanitizeResult(
  result: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  return (sanitizeResultValue(result ?? {}) as Record<string, unknown>) ?? {};
}

function findStep(
  definition: GuidedFlowDefinition,
  stepId: string,
): GuidedFlowStepDefinition {
  const step = definition.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown GuidedFlow step "${stepId}"`);
  return step;
}

export function getGuidedFlowStep(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): GuidedFlowStepDefinition {
  assertDefinitionMatches(definition, instance);
  return findStep(definition, instance.currentStepId);
}

function assertActive(instance: GuidedFlowInstance): void {
  if (instance.status !== "active") {
    throw new Error(`GuidedFlow instance is not active (${instance.status})`);
  }
}

function assertDefinitionMatches(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): void {
  if (
    instance.flowId !== definition.id ||
    instance.flowVersion !== definition.version
  ) {
    throw new Error("GuidedFlow definition version does not match instance");
  }
}

export function createGuidedFlowInstance(
  definition: GuidedFlowDefinition,
  instanceId: string,
  instanceKey?: string,
): GuidedFlowInstance {
  const firstStep = definition.steps[0];
  if (!firstStep) throw new Error("GuidedFlow must define at least one step");
  if (!instanceId.trim()) throw new Error("GuidedFlow instanceId is required");

  return {
    instanceId,
    ...(instanceKey ? { instanceKey } : {}),
    flowId: definition.id,
    flowVersion: definition.version,
    currentStepId: firstStep.id,
    status: "active",
    revision: 0,
    data: {},
    history: [],
  };
}

export function advanceGuidedFlow(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  submit: GuidedFlowSubmit,
): GuidedFlowInstance {
  assertActive(instance);
  assertDefinitionMatches(definition, instance);
  if (!submit.actionId.trim())
    throw new Error("GuidedFlow actionId is required");

  const step = findStep(definition, instance.currentStepId);
  if (step.allowedActions && !step.allowedActions.includes(submit.actionId)) {
    throw new Error(
      `Unknown action "${submit.actionId}" from step "${step.id}"`,
    );
  }
  const nextStepId = step.transitions?.[submit.actionId];
  const nextData = {
    ...instance.data,
    actionId: submit.actionId,
    ...sanitizeResult(submit.result),
  };

  if (!step.transitions || Object.keys(step.transitions).length === 0) {
    return {
      ...instance,
      status: "completed",
      revision: instance.revision + 1,
      data: nextData,
    };
  }

  if (!nextStepId) {
    throw new Error(
      `Unknown transition "${submit.actionId}" from step "${step.id}"`,
    );
  }
  findStep(definition, nextStepId);

  return {
    ...instance,
    currentStepId: nextStepId,
    revision: instance.revision + 1,
    data: nextData,
    history: [...instance.history, step.id],
  };
}

export function goBackGuidedFlow(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): GuidedFlowInstance {
  assertActive(instance);
  assertDefinitionMatches(definition, instance);
  const previousStepId = instance.history.at(-1);
  if (!previousStepId)
    throw new Error("GuidedFlow is already at its first step");
  findStep(definition, previousStepId);

  return {
    ...instance,
    currentStepId: previousStepId,
    revision: instance.revision + 1,
    history: instance.history.slice(0, -1),
  };
}

export function cancelGuidedFlow(
  instance: GuidedFlowInstance,
): GuidedFlowInstance {
  assertActive(instance);
  return {
    ...instance,
    status: "cancelled",
    revision: instance.revision + 1,
  };
}
