import type { GuidedFlowControlId } from "./control-contract";

export type GuidedFlowStatus = "active" | "completed" | "cancelled";

export interface GuidedFlowTransitionMap {
  readonly [actionId: string]: string;
}

interface GuidedFlowStepBase {
  readonly id: string;
  readonly title: string;
  readonly explanation: string;
  readonly authoringGoal?: string;
  readonly routeId?: string;
  readonly transitions?: GuidedFlowTransitionMap;
}

export interface GuidedFlowViewStepDefinition extends GuidedFlowStepBase {
  readonly type?: "view";
  readonly rendererSlug: string;
  /** Exact renderer contract version. Legacy built-ins may omit this. */
  readonly rendererVersion?: number;
  readonly rendererData?: Readonly<Record<string, unknown>>;
  readonly allowedActions?: readonly string[];
}

export interface GuidedFlowNestedStepDefinition extends GuidedFlowStepBase {
  readonly type: "flow";
  readonly flowId: string;
  readonly flowVersion: number;
}

export type GuidedFlowStepDefinition =
  GuidedFlowViewStepDefinition | GuidedFlowNestedStepDefinition;

export interface GuidedFlowDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly steps: readonly GuidedFlowStepDefinition[];
  readonly completionRouteId?: string;
  readonly controls?: readonly GuidedFlowControlId[];
}

export interface GuidedFlowFrame {
  readonly flowId: string;
  readonly flowVersion: number;
  readonly currentStepId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly backStack: readonly string[];
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
  readonly output: Readonly<Record<string, unknown>>;
  readonly backStack: readonly string[];
  readonly stack: readonly GuidedFlowFrame[];
}

export interface GuidedFlowSubmit {
  readonly actionId: string;
  readonly result?: Readonly<Record<string, unknown>>;
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
    output: {},
    backStack: [],
    stack: [],
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
  if (
    !isNestedGuidedFlowStep(step) &&
    step.allowedActions &&
    !step.allowedActions.includes(submit.actionId)
  ) {
    throw new Error(
      `Unknown action "${submit.actionId}" from step "${step.id}"`,
    );
  }
  const nextStepId = step.transitions?.[submit.actionId];
  const result = sanitizeGuidedFlowData(submit.result);
  const stepResultKey = `${definition.id}@${definition.version}/${step.id}`;
  const existingStepResults =
    instance.data.stepResults &&
    typeof instance.data.stepResults === "object" &&
    !Array.isArray(instance.data.stepResults)
      ? (instance.data.stepResults as Readonly<Record<string, unknown>>)
      : {};
  const nextData = {
    ...instance.data,
    ...result,
    actionId: submit.actionId,
    stepResults: {
      ...existingStepResults,
      [stepResultKey]: {
        actionId: submit.actionId,
        result,
      },
    },
  };

  if (
    !step.transitions ||
    Object.keys(step.transitions).length === 0 ||
    (!nextStepId &&
      !isNestedGuidedFlowStep(step) &&
      step.allowedActions?.includes(submit.actionId))
  ) {
    return {
      ...instance,
      status: "completed",
      revision: instance.revision + 1,
      data: nextData,
      output: result,
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
    backStack: [...instance.backStack, step.id],
  };
}

export function goBackGuidedFlow(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): GuidedFlowInstance {
  assertActive(instance);
  assertDefinitionMatches(definition, instance);
  const previousStepId = instance.backStack.at(-1);
  if (!previousStepId)
    throw new Error("GuidedFlow is already at its first step");
  findStep(definition, previousStepId);

  return {
    ...instance,
    currentStepId: previousStepId,
    revision: instance.revision + 1,
    backStack: instance.backStack.slice(0, -1),
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

export function isNestedGuidedFlowStep(
  step: GuidedFlowStepDefinition,
): step is GuidedFlowNestedStepDefinition {
  return step.type === "flow";
}
import { sanitizeGuidedFlowData } from "./safe-data";
