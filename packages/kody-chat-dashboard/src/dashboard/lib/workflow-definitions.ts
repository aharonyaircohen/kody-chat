/**
 * @fileType utility
 * @domain kody
 * @pattern workflow-definitions
 * @ai-summary Shared company workflow definition contract and validation
 *   under `<statePath>/workflows/<id>/workflow.json`.
 */

import { slugifyTitle } from "@kody-ade/base/slug";
import { z } from "zod";

export interface WorkflowDefinition {
  name: string;
  /** One Agent runs every step. Direct Capability runs use Kody. */
  agent: string;
  capabilities: string[];
  startAt?: string;
  steps?: WorkflowStepDefinition[];
  runWithoutApproval?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const workflowTransitionDefinitionSchema = z.object({
  to: z.string().trim().min(1).max(80),
  when: z.record(z.string(), z.unknown()).optional(),
  default: z.boolean().optional(),
  maxIterations: z.number().int().positive().optional(),
});

export type WorkflowTransitionDefinition = z.infer<
  typeof workflowTransitionDefinitionSchema
>;

export const workflowStepDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  capability: z.string().trim().min(1).max(80),
  /** One JSON-compatible value passed to this capability. */
  input: z.unknown().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  evidence: z.string().trim().min(1).optional(),
  target: z.enum(["issue", "pr"]).optional(),
  /** Wrapper-owned delivery policy applied after the capability succeeds. */
  delivery: z.literal("pull-request").optional(),
  targetFact: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
  next: z.array(workflowTransitionDefinitionSchema).optional(),
  runWhen: z.record(z.string(), z.unknown()).optional(),
  continueOn: z.array(z.string().trim().min(1)).optional(),
  saveReport: z.boolean().optional(),
  report: z.record(z.string(), z.unknown()).optional(),
});

export type WorkflowStepDefinition = z.infer<
  typeof workflowStepDefinitionSchema
>;

type WorkflowStepExecutionDefinition = Omit<
  WorkflowStepDefinition,
  "id" | "capability" | "input" | "next"
>;

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
  agent?: string;
  capabilities: string[];
  startAt?: string;
  steps?: WorkflowStepDefinition[];
  runWithoutApproval?: boolean;
}

export interface UpdateWorkflowDefinitionInput {
  name?: string;
  agent?: string;
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

export const WORKFLOW_END_STEP_ID = "$end";

const WORKFLOW_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const CAPABILITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
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
    const hasInput = Object.prototype.hasOwnProperty.call(raw, "input");
    const next = normalizeWorkflowTransitions(raw.next);
    steps.push({
      id,
      capability,
      ...(hasInput ? { input: raw.input } : {}),
      ...normalizeWorkflowStepExecution(raw),
      ...(next.length > 0 ? { next } : {}),
    });
  }
  return steps;
}

function normalizeWorkflowStepExecution(
  raw: Record<string, unknown>,
): WorkflowStepExecutionDefinition {
  const action =
    typeof raw.action === "string" &&
    CAPABILITY_ID_PATTERN.test(raw.action.trim())
      ? raw.action.trim()
      : undefined;
  const evidence =
    typeof raw.evidence === "string" && raw.evidence.trim()
      ? raw.evidence.trim()
      : undefined;
  const target =
    raw.target === "issue" || raw.target === "pr" ? raw.target : undefined;
  const delivery = raw.delivery === "pull-request" ? raw.delivery : undefined;
  const targetFact =
    typeof raw.targetFact === "string" && raw.targetFact.trim()
      ? raw.targetFact.trim()
      : undefined;
  const reason =
    typeof raw.reason === "string" && raw.reason.trim()
      ? raw.reason.trim()
      : undefined;
  const runWhen =
    raw.runWhen &&
    typeof raw.runWhen === "object" &&
    !Array.isArray(raw.runWhen)
      ? (raw.runWhen as Record<string, unknown>)
      : undefined;
  const continueOn = Array.isArray(raw.continueOn)
    ? raw.continueOn
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .map((value) => value.trim())
    : [];
  const report =
    raw.report &&
    typeof raw.report === "object" &&
    !Array.isArray(raw.report) &&
    isJsonValue(raw.report)
      ? (raw.report as Record<string, unknown>)
      : undefined;
  return {
    ...(action ? { action } : {}),
    ...(evidence ? { evidence } : {}),
    ...(target ? { target } : {}),
    ...(delivery ? { delivery } : {}),
    ...(targetFact ? { targetFact } : {}),
    ...(reason ? { reason } : {}),
    ...(runWhen ? { runWhen } : {}),
    ...(continueOn.length > 0 ? { continueOn } : {}),
    ...(raw.saveReport === true ? { saveReport: true } : {}),
    ...(report ? { report } : {}),
  };
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
      if (to === WORKFLOW_END_STEP_ID || WORKFLOW_ID_PATTERN.test(to)) {
        transitions.push({ to });
      }
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const to = typeof raw.to === "string" ? raw.to.trim() : "";
    if (to !== WORKFLOW_END_STEP_ID && !WORKFLOW_ID_PATTERN.test(to)) continue;
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
  const requestedAgent =
    typeof raw.agent === "string" ? raw.agent.trim().toLowerCase() : "";
  const agent = AGENT_ID_PATTERN.test(requestedAgent) ? requestedAgent : "kody";
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
    name,
    agent,
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
    name: input.name.trim(),
    agent: AGENT_ID_PATTERN.test((input.agent ?? "kody").trim().toLowerCase())
      ? (input.agent ?? "kody").trim().toLowerCase()
      : "kody",
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
      agent: input.agent ?? existing.agent,
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
    if (
      options.knownCapabilities &&
      !options.knownCapabilities.has(step.capability)
    )
      addIssue(
        issues,
        "unknown_capability",
        `steps[${index}].capability`,
        `Capability ${step.capability} is not available in this agency.`,
      );
    if (
      Object.prototype.hasOwnProperty.call(step, "input") &&
      !isJsonValue(step.input)
    )
      addIssue(
        issues,
        "invalid_input",
        `steps[${index}].input`,
        "Capability input must be one JSON value.",
      );
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
  const explicitEndSources = new Set<string>();
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
      if (transition.to === WORKFLOW_END_STEP_ID) {
        explicitEndSources.add(step.id);
      }
      const targetIndex = ids.indexOf(transition.to);
      if (transition.to !== WORKFLOW_END_STEP_ID && targetIndex < 0) {
        addIssue(
          issues,
          "missing_transition_target",
          `${path}.to`,
          `Step ${step.id} connects to missing step ${transition.to}.`,
        );
      } else if (targetIndex >= 0) {
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
    if (
      ![...reachable].some(
        (id) =>
          (adjacency.get(id) ?? []).length === 0 || explicitEndSources.has(id),
      )
    )
      addIssue(
        issues,
        "missing_terminal_step",
        "steps",
        "Workflow has no reachable final step.",
      );
  }
  return issues;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
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
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return true;
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => isWorkflowConditionValue(item) && !Array.isArray(item),
    )
  );
}
