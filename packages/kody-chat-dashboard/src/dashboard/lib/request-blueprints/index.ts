import type {
  GuidedFlowActionTarget,
  GuidedFlowDefinition,
  GuidedFlowStepDefinition,
} from "../guided-flows/model";
import type { RequestBlueprintDefinition } from "./model";

export type { RequestBlueprintDefinition } from "./model";

function validateRequestBlueprint(
  definition: RequestBlueprintDefinition,
): void {
  if (!definition.id.trim())
    throw new Error("Request Blueprint id is required");
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error("Request Blueprint version must be a positive integer");
  }
  if (!definition.title.trim()) {
    throw new Error("Request Blueprint title is required");
  }
  if (!definition.purpose.trim()) {
    throw new Error("Request Blueprint purpose is required");
  }
  if (definition.steps.length === 0) {
    throw new Error("Request Blueprint must define at least one step");
  }

  const stepIds = new Set<string>();
  for (const step of definition.steps) {
    if (!step.id.trim())
      throw new Error("Request Blueprint step id is required");
    if (stepIds.has(step.id)) throw new Error(`Duplicate step id "${step.id}"`);
    stepIds.add(step.id);
  }

  for (const step of definition.steps) {
    const actionIds = new Set<string>();
    for (const action of step.actions) {
      if (actionIds.has(action.id)) {
        throw new Error(
          `Duplicate action id "${action.id}" in step "${step.id}"`,
        );
      }
      actionIds.add(action.id);
      if (action.target.type === "step" && !stepIds.has(action.target.stepId)) {
        throw new Error(
          `Unknown step target "${action.target.stepId}" from step "${step.id}"`,
        );
      }
    }
  }
}

export function buildGuidedFlowFromRequestBlueprint(
  definition: RequestBlueprintDefinition,
): GuidedFlowDefinition {
  validateRequestBlueprint(definition);
  const { purpose: _purpose, ...flow } = definition;
  return flow;
}

function targetGuide(target: GuidedFlowActionTarget): string {
  return target.type === "step" ? `step:${target.stepId}` : target.type;
}

function stepKind(step: GuidedFlowStepDefinition): string {
  if (step.type === "command") return `command: ${step.command}`;
  if (step.type === "flow") return `flow: ${step.flowId}@${step.flowVersion}`;
  return `view: ${step.rendererSlug}${
    step.rendererVersion ? `@${step.rendererVersion}` : ""
  }`;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function buildRequestBlueprintModelGuide(
  definition: RequestBlueprintDefinition,
): string {
  validateRequestBlueprint(definition);
  const steps = definition.steps.map((step, index) => {
    const lines = [
      `${index + 1}. ${step.id} [${stepKind(step)}]`,
      `   title: ${step.title}`,
      `   guidance: ${step.explanation}`,
    ];
    if (step.authoringGoal) lines.push(`   goal: ${step.authoringGoal}`);
    if (step.routeId) {
      lines.push(
        `   route: ${step.routeId}${
          step.routeParameters ? ` ${json(step.routeParameters)}` : ""
        }`,
      );
    }
    if (step.type !== "command" && step.type !== "flow" && step.rendererData) {
      lines.push(`   renderer data: ${json(step.rendererData)}`);
    }
    lines.push(
      `   actions: ${step.actions
        .map((action) => `${action.id} -> ${targetGuide(action.target)}`)
        .join(", ")}`,
    );
    return lines.join("\n");
  });

  const completionRoute = definition.completionRouteId
    ? `completion route: ${definition.completionRouteId}${
        definition.completionRouteParameters
          ? ` ${json(definition.completionRouteParameters)}`
          : ""
      }`
    : "completion route: none";

  return [
    `Request Blueprint: ${definition.title}`,
    `Purpose: ${definition.purpose}`,
    "Follow the same ordered steps, guidance, routes, commands, and action boundaries as the user Guided Flow.",
    ...steps,
    completionRoute,
  ].join("\n");
}
