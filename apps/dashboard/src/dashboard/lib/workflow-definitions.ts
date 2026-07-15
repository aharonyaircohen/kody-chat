/**
 * @fileType utility
 * @domain kody
 * @pattern workflow-definitions
 * @ai-summary Company workflow definitions stored as ordered capability queues
 *   under `<statePath>/workflows/<id>/workflow.json`.
 */

import { slugifyTitle } from "@kody-ade/base/slug";

export interface WorkflowDefinition {
  version: 1;
  name: string;
  capabilities: string[];
  startAt?: string;
  steps?: WorkflowStepDefinition[];
  runWithoutApproval?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInputMapping {
  from: string;
}

export interface WorkflowTransitionDefinition {
  to: string;
  when?: Record<string, unknown>;
  default?: boolean;
  maxIterations?: number;
}

export interface WorkflowStepDefinition {
  id: string;
  capability: string;
  inputs?: Record<string, WorkflowInputMapping>;
  next?: WorkflowTransitionDefinition[];
}

export interface WorkflowDefinitionRecord {
  id: string;
  path: string;
  workflow: WorkflowDefinition;
  updatedAt?: string;
  source?: "local" | "store";
  readOnly?: boolean;
  /** True when this workflow can be dispatched directly by kody.yml. */
  runnable?: boolean;
  htmlUrl?: string | null;
}

export interface CreateWorkflowDefinitionInput {
  id?: string;
  name: string;
  capabilities: string[];
  startAt?: string;
  steps?: WorkflowStepDefinition[];
  runWithoutApproval?: boolean;
}

export interface UpdateWorkflowDefinitionInput {
  name?: string;
  capabilities?: string[];
  startAt?: string;
  steps?: WorkflowStepDefinition[];
  runWithoutApproval?: boolean;
}

export interface WorkflowValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface WorkflowValidationOptions {
  knownCapabilities?: ReadonlySet<string>;
}

const WORKFLOW_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const CAPABILITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const WORKFLOW_DATA_PATH =
  /^(facts|evidence|artifacts|result|workflow|lastOutcome)(?:\.[A-Za-z_][A-Za-z0-9_-]*)+$/;

export function isWorkflowDefinitionId(value: string): boolean {
  return WORKFLOW_ID_PATTERN.test(value);
}

export function slugifyWorkflowDefinitionId(value: string): string {
  return slugifyTitle(value, { maxLength: 80 }).replace(/[-_]+$/g, "");
}

export function workflowDefinitionPath(id: string): string {
  if (!isWorkflowDefinitionId(id)) {
    throw new Error(`Invalid workflow id "${id}"`);
  }
  return `workflows/${id}/workflow.json`;
}

export function normalizeWorkflowCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const capabilities: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const slug = item.trim();
    if (!CAPABILITY_ID_PATTERN.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    capabilities.push(slug);
  }
  return capabilities;
}

function normalizeWorkflowSteps(value: unknown): WorkflowStepDefinition[] {
  if (!Array.isArray(value)) return [];
  const steps: WorkflowStepDefinition[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const capability =
      typeof raw.capability === "string" ? raw.capability.trim() : "";
    if (
      !WORKFLOW_ID_PATTERN.test(id) ||
      !CAPABILITY_ID_PATTERN.test(capability)
    )
      continue;
    const inputs = normalizeWorkflowInputs(raw.inputs);
    const next = normalizeWorkflowTransitions(raw.next);
    steps.push({
      id,
      capability,
      ...(inputs ? { inputs } : {}),
      ...(next.length > 0 ? { next } : {}),
    });
  }
  return steps;
}

function normalizeWorkflowInputs(
  value: unknown,
): Record<string, WorkflowInputMapping> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const inputs: Record<string, WorkflowInputMapping> = {};
  for (const [name, item] of Object.entries(value)) {
    if (!CAPABILITY_ID_PATTERN.test(name)) continue;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const from = (item as { from?: unknown }).from;
    if (typeof from === "string" && from.trim())
      inputs[name] = { from: from.trim() };
  }
  return Object.keys(inputs).length > 0 ? inputs : undefined;
}

function normalizeWorkflowTransitions(
  value: unknown,
): WorkflowTransitionDefinition[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  const transitions: WorkflowTransitionDefinition[] = [];
  for (const item of values) {
    if (typeof item === "string") {
      const to = item.trim();
      if (WORKFLOW_ID_PATTERN.test(to)) transitions.push({ to });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const to = typeof raw.to === "string" ? raw.to.trim() : "";
    if (!WORKFLOW_ID_PATTERN.test(to)) continue;
    const maxIterations =
      typeof raw.maxIterations === "number" &&
      Number.isInteger(raw.maxIterations) &&
      raw.maxIterations > 0
        ? raw.maxIterations
        : undefined;
    transitions.push({
      to,
      ...(raw.when && typeof raw.when === "object" && !Array.isArray(raw.when)
        ? { when: raw.when as Record<string, unknown> }
        : {}),
      ...(raw.default === true ? { default: true } : {}),
      ...(maxIterations ? { maxIterations } : {}),
    });
  }
  return transitions;
}

export function normalizeWorkflowDefinition(
  value: unknown,
): WorkflowDefinition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const steps = normalizeWorkflowSteps(raw.steps);
  const capabilities = normalizeWorkflowCapabilities([
    ...normalizeWorkflowCapabilities(raw.capabilities),
    ...steps.map((step) => step.capability),
  ]);
  const startAt = typeof raw.startAt === "string" ? raw.startAt.trim() : "";
  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt.trim()
      ? raw.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt
      : createdAt;

  if (!name || capabilities.length === 0) return null;
  return {
    version: 1,
    name,
    capabilities,
    ...(startAt && WORKFLOW_ID_PATTERN.test(startAt) ? { startAt } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(raw.runWithoutApproval === true ? { runWithoutApproval: true } : {}),
    createdAt,
    updatedAt,
  };
}

export function buildWorkflowDefinition(
  input: CreateWorkflowDefinitionInput,
  existing?: WorkflowDefinition,
): WorkflowDefinition {
  const now = new Date().toISOString();
  return {
    version: 1,
    name: input.name.trim(),
    capabilities: normalizeWorkflowCapabilities(input.capabilities),
    ...(input.startAt ? { startAt: input.startAt } : {}),
    ...(input.steps && input.steps.length > 0 ? { steps: input.steps } : {}),
    ...(input.runWithoutApproval === true ? { runWithoutApproval: true } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function mergeWorkflowDefinition(
  existing: WorkflowDefinition,
  input: UpdateWorkflowDefinitionInput,
): WorkflowDefinition {
  return buildWorkflowDefinition(
    {
      name: input.name ?? existing.name,
      capabilities: input.capabilities ?? existing.capabilities,
      startAt: input.startAt ?? existing.startAt,
      steps: input.steps ?? existing.steps,
      runWithoutApproval:
        input.runWithoutApproval ?? existing.runWithoutApproval,
    },
    existing,
  );
}

/**
 * Strict boundary validation for agent-authored workflow graphs. Normalization
 * is deliberately not used here: invalid connections must be rejected, not
 * silently removed before save or execution.
 */
export function validateWorkflowDefinition(
  workflow: WorkflowDefinition,
  options: WorkflowValidationOptions = {},
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const steps = workflow.steps ?? [];
  if (steps.length === 0) return issues;
  if (steps.length > 100)
    addIssue(
      issues,
      "too_many_steps",
      "steps",
      `Workflow has ${steps.length} steps; maximum is 100.`,
    );

  const declared = new Set(workflow.capabilities);
  const ids = steps.map((step) => step.id);
  const idSet = new Set<string>();
  steps.forEach((step, index) => {
    if (idSet.has(step.id))
      addIssue(
        issues,
        "duplicate_step_id",
        `steps[${index}].id`,
        `Step id ${step.id} is duplicated.`,
      );
    idSet.add(step.id);
    if (!declared.has(step.capability))
      addIssue(
        issues,
        "undeclared_capability",
        `steps[${index}].capability`,
        `Capability ${step.capability} is not declared by this workflow.`,
      );
    if (options.knownCapabilities && !options.knownCapabilities.has(step.capability))
      addIssue(
        issues,
        "unknown_capability",
        `steps[${index}].capability`,
        `Capability ${step.capability} is not available in this agency.`,
      );
    for (const [name, mapping] of Object.entries(step.inputs ?? {})) {
      if (!WORKFLOW_DATA_PATH.test(mapping.from))
        addIssue(
          issues,
          "invalid_data_path",
          `steps[${index}].inputs.${name}.from`,
          "Input must come from workflow result data.",
        );
    }
  });

  const startAt = workflow.startAt ?? ids[0];
  if (!startAt || !idSet.has(startAt))
    addIssue(
      issues,
      "missing_start_step",
      "startAt",
      `Start step ${startAt ?? "<none>"} does not exist.`,
    );

  const adjacency = new Map<string, string[]>();
  steps.forEach((step, stepIndex) => {
    const transitions = step.next ?? [];
    adjacency.set(step.id, []);
    if (transitions.length > 20)
      addIssue(
        issues,
        "too_many_transitions",
        `steps[${stepIndex}].next`,
        `Step ${step.id} has more than 20 connections.`,
      );
    const conditionals = transitions.filter((transition) => transition.when);
    const defaults = transitions.filter((transition) => transition.default);
    const unconditional = transitions.filter(
      (transition) =>
        !transition.when &&
        !transition.default &&
        transition.maxIterations === undefined,
    );
    if (defaults.length > 1)
      addIssue(
        issues,
        "multiple_default_transitions",
        `steps[${stepIndex}].next`,
        `Step ${step.id} has more than one Otherwise connection.`,
      );
    if (conditionals.length > 0 && defaults.length !== 1)
      addIssue(
        issues,
        "missing_default_transition",
        `steps[${stepIndex}].next`,
        `Step ${step.id} has conditions and needs one Otherwise connection.`,
      );
    if (
      unconditional.length > 1 ||
      (unconditional.length > 0 && transitions.length > 1)
    )
      addIssue(
        issues,
        "ambiguous_transition",
        `steps[${stepIndex}].next`,
        `Step ${step.id} mixes a direct connection with other choices.`,
      );

    transitions.forEach((transition, transitionIndex) => {
      const path = `steps[${stepIndex}].next[${transitionIndex}]`;
      const targetIndex = ids.indexOf(transition.to);
      if (targetIndex < 0) {
        addIssue(
          issues,
          "missing_transition_target",
          `${path}.to`,
          `Step ${step.id} connects to missing step ${transition.to}.`,
        );
      } else {
        adjacency.get(step.id)?.push(transition.to);
      }
      if (transition.default && transition.when)
        addIssue(
          issues,
          "conflicting_transition",
          path,
          "A connection cannot be both conditional and Otherwise.",
        );
      for (const [field, expected] of Object.entries(transition.when ?? {})) {
        if (!WORKFLOW_DATA_PATH.test(field))
          addIssue(
            issues,
            "invalid_data_path",
            `${path}.when.${field}`,
            "Condition must use workflow result data.",
          );
        if (!isWorkflowConditionValue(expected))
          addIssue(
            issues,
            "invalid_condition_value",
            `${path}.when.${field}`,
            "Condition value must be text, a number, true, false, or null.",
          );
      }
      if (targetIndex >= 0 && targetIndex <= stepIndex) {
        if (
          !Number.isInteger(transition.maxIterations) ||
          Number(transition.maxIterations) < 1
        )
          addIssue(
            issues,
            "unbounded_loop",
            `${path}.maxIterations`,
            `Loop ${step.id} to ${transition.to} needs a repeat limit.`,
          );
        else if (Number(transition.maxIterations) > 100)
          addIssue(
            issues,
            "loop_limit_too_high",
            `${path}.maxIterations`,
            `Loop repeat limit cannot exceed 100.`,
          );
      }
    });
  });

  if (startAt && idSet.has(startAt)) {
    const reachable = new Set<string>();
    const pending = [startAt];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      pending.push(...(adjacency.get(id) ?? []));
    }
    steps.forEach((step, index) => {
      if (!reachable.has(step.id))
        addIssue(
          issues,
          "unreachable_step",
          `steps[${index}]`,
          `Step ${step.id} can never run.`,
        );
    });
    if (![...reachable].some((id) => (adjacency.get(id) ?? []).length === 0))
      addIssue(
        issues,
        "missing_terminal_step",
        "steps",
        "Workflow has no reachable final step.",
      );
  }
  return issues;
}

function addIssue(
  issues: WorkflowValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isWorkflowConditionValue(value: unknown): boolean {
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  )
    return true;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => isWorkflowConditionValue(item) && !Array.isArray(item),
    )
  );
}
