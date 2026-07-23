export type Lifecycle = "draft" | "active" | "paused" | "retired" | "archived";
export type ReferenceKind =
  | "intent"
  | "operation"
  | "goal"
  | "loop"
  | "workflow"
  | "capability"
  | "implementation"
  | "agent";
export interface DefinitionRef {
  kind: ReferenceKind;
  id: string;
}
export interface PinnedDefinitionRef extends DefinitionRef {
  revision: string;
}
export interface Scope {
  include: Readonly<Record<string, readonly string[]>>;
  exclude: Readonly<Record<string, readonly string[]>>;
}
export interface Constraint {
  id: string;
  rule: string;
  actions: string[];
  effect: "deny" | "require-approval";
}
export interface Policy {
  approval: "none" | "risky-actions" | "all-actions";
  authority: {
    allow: string[];
    deny: string[];
  };
  budget: {
    maxRuns: number;
    maxTokens: number;
    maxCostUsd: number;
    maxDurationSeconds: number;
  };
  maxConcurrentRuns: number;
  riskyActions: string[];
}
export interface Objective {
  desiredState: string;
  requiredEvidence: string[];
  scope: Scope;
}
export type Trigger =
  | { type: "manual" }
  | {
      type: "schedule";
      every: string;
      at?: { time: string; timezone: string };
    }
  | { type: "event"; event: string }
  | { type: "webhook"; event: string }
  | { type: "condition"; expression: string };
export interface GoalDefinition {
  id: string;
  operationId: string;
  objective: Objective;
  executionRef: DefinitionRef & { kind: "workflow" | "capability" };
}
export interface LoopDefinition {
  id: string;
  operationId: string;
  objective: Objective;
  trigger: Trigger;
  targetRef: DefinitionRef & { kind: "goal" | "workflow" | "capability" };
  reconciliationPolicy: {
    overlap: "skip" | "queue";
    missed: "skip" | "replay" | "coalesce";
    failure: {
      maxAttempts: number;
      backoffSeconds: number;
      timeoutSeconds: number;
    };
  };
}
export interface CapabilityDefinition {
  id: string;
  action: string;
  purpose: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  effects: string[];
  permissions: string[];
  success: string;
  failure: string;
}
export interface JsonSchema {
  readonly [key: string]: unknown;
}
export type ImplementationDefinition =
  | {
      id: string;
      capabilityRef: DefinitionRef & { kind: "capability" };
      compatibleCapabilityRevision: string;
      type: "agent";
      agentRef: DefinitionRef & { kind: "agent" };
    }
  | {
      id: string;
      capabilityRef: DefinitionRef & { kind: "capability" };
      compatibleCapabilityRevision: string;
      type: "script";
    };
export interface WorkflowStep {
  id: string;
  capabilityRef: DefinitionRef & { kind: "capability" };
  dependsOn: string[];
  input?: Readonly<Record<string, unknown>>;
  condition?: string;
  retry?: { maxAttempts: number; backoffSeconds: number };
}
export interface WorkflowDefinition {
  id: string;
  steps: WorkflowStep[];
}
export interface IntentDefinition {
  id: string;
  direction: string;
  description?: string;
  priority: number;
  posture:
    "confidence" | "speed" | "stability-recovery" | "maintenance" | "balanced";
  scope: Scope;
  priorities: string[];
  measures: string[];
  policyRefs: string[];
  deliveryPolicy: {
    cadence: "manual" | "15m" | "1d" | "1w";
    assurance: "light" | "standard" | "strict";
    blockerSensitivity: "low" | "standard" | "strict";
  };
  policy: Policy;
  constraints: Constraint[];
}
export interface OperationDefinition {
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string[];
  intentIds: string[];
}
export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  constraints: Constraint[];
}
export interface IntentState {
  definitionId: string;
  lifecycle: Lifecycle;
  updatedAt: string;
}
export interface OperationState {
  definitionId: string;
  lifecycle: Lifecycle;
  updatedAt: string;
}
export interface GoalState {
  definitionId: string;
  lifecycle: Lifecycle;
  progress: number;
  blockers: string[];
  updatedAt: string;
}
export interface LoopState {
  definitionId: string;
  lifecycle: Lifecycle;
  health: "unknown" | "healthy" | "degraded" | "failing";
  failures: number;
  lastFiredAt?: string;
  nextEligibleAt?: string;
  updatedAt: string;
}
export interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  origin: PinnedDefinitionRef;
  target: PinnedDefinitionRef;
  trace: PinnedDefinitionRef[];
  execution?: {
    capability: PinnedDefinitionRef & { kind: "capability" };
    implementation: PinnedDefinitionRef & { kind: "implementation" };
  };
  parentRunId?: string;
  effectivePolicy: {
    hash: string;
    policy: Policy;
    constraints: Constraint[];
  };
  correlationId: string;
  startedAt: string;
  finishedAt?: string;
  usage?: {
    tokens: number;
    costUsd: number;
    durationSeconds: number;
  };
}
export interface RunOutput {
  kind: "fact" | "evidence" | "artifact";
  key: string;
  value: unknown;
  runId: string;
  producer: DefinitionRef;
  parentRef?: PinnedDefinitionRef & { kind: "goal" | "loop" };
  contract: string;
  createdAt: string;
}

type UnknownRecord = Record<string, unknown>;
const ID = /^[a-z][a-z0-9-]{0,127}$/;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as UnknownRecord;
}
function exact(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label} has unknown field "${unknown}"`);
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} is required`);
  return value.trim();
}
function identifier(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ID.test(result)) throw new Error(`${label} is invalid`);
  return result;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result)))
    throw new Error(`${label} must be an ISO timestamp`);
  return result;
}
function strings(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}
function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be a positive number`);
  return value;
}
function scopeDimensions(
  value: unknown,
  label: string,
): Readonly<Record<string, readonly string[]>> {
  const input = record(value, label);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(input).map(([dimension, members]) => [
        identifier(dimension, `${label} dimension`),
        Object.freeze(strings(members, `${label}.${dimension}`)),
      ]),
    ),
  );
}
function parseScope(value: unknown): Scope {
  const input = record(value, "Scope");
  exact(input, ["include", "exclude"], "Scope");
  return Object.freeze({
    include: scopeDimensions(input.include ?? {}, "Scope include"),
    exclude: scopeDimensions(input.exclude ?? {}, "Scope exclude"),
  });
}
function parseConstraints(value: unknown, label: string): Constraint[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const constraints = value.map((item) => {
    const input = record(item, "Constraint");
    exact(input, ["id", "rule", "actions", "effect"], "Constraint");
    if (input.effect !== "deny" && input.effect !== "require-approval")
      throw new Error("Constraint effect is invalid");
    return Object.freeze({
      id: identifier(input.id, "Constraint id"),
      rule: text(input.rule, "Constraint rule"),
      actions: strings(input.actions, "Constraint actions"),
      effect: input.effect,
    });
  });
  if (new Set(constraints.map(({ id }) => id)).size !== constraints.length)
    throw new Error(`${label} ids must be unique`);
  return constraints;
}
export function createPolicy(value: unknown): Policy {
  const input = record(value, "Policy");
  exact(
    input,
    ["approval", "authority", "budget", "maxConcurrentRuns", "riskyActions"],
    "Policy",
  );
  if (
    input.approval !== "none" &&
    input.approval !== "risky-actions" &&
    input.approval !== "all-actions"
  )
    throw new Error("Policy approval is invalid");
  const authority = record(input.authority, "Policy authority");
  exact(authority, ["allow", "deny"], "Policy authority");
  const budget = record(input.budget, "Policy budget");
  exact(
    budget,
    ["maxRuns", "maxTokens", "maxCostUsd", "maxDurationSeconds"],
    "Policy budget",
  );
  return Object.freeze({
    approval: input.approval,
    authority: Object.freeze({
      allow: strings(authority.allow, "Policy authority allow"),
      deny: strings(authority.deny, "Policy authority deny"),
    }),
    budget: Object.freeze({
      maxRuns: positiveNumber(budget.maxRuns, "Policy budget maxRuns"),
      maxTokens: positiveNumber(budget.maxTokens, "Policy budget maxTokens"),
      maxCostUsd: positiveNumber(budget.maxCostUsd, "Policy budget maxCostUsd"),
      maxDurationSeconds: positiveNumber(
        budget.maxDurationSeconds,
        "Policy budget maxDurationSeconds",
      ),
    }),
    maxConcurrentRuns: positiveNumber(
      input.maxConcurrentRuns,
      "Policy maxConcurrentRuns",
    ),
    riskyActions: strings(input.riskyActions, "Policy riskyActions"),
  });
}
function reference(
  value: unknown,
  kinds: readonly ReferenceKind[],
  label: string,
): DefinitionRef {
  const input = record(value, label);
  exact(input, ["kind", "id"], label);
  if (
    typeof input.kind !== "string" ||
    !kinds.includes(input.kind as ReferenceKind)
  ) {
    throw new Error(`${label}.kind is invalid`);
  }
  return {
    kind: input.kind as ReferenceKind,
    id: identifier(input.id, `${label}.id`),
  };
}
function pinnedReference(
  value: unknown,
  kinds: readonly ReferenceKind[],
  label: string,
): PinnedDefinitionRef {
  const input = record(value, label);
  exact(input, ["kind", "id", "revision"], label);
  const base = reference({ kind: input.kind, id: input.id }, kinds, label);
  return Object.freeze({
    ...base,
    revision: text(input.revision, `${label}.revision`),
  });
}
function parseObjective(value: unknown): Objective {
  const input = record(value, "Objective");
  exact(input, ["desiredState", "requiredEvidence", "scope"], "Objective");
  return {
    desiredState: text(input.desiredState, "Objective desiredState"),
    requiredEvidence: strings(
      input.requiredEvidence,
      "Objective requiredEvidence",
    ),
    scope: parseScope(input.scope),
  };
}

export function createGoalDefinition(value: unknown): GoalDefinition {
  const input = record(value, "GoalDefinition");
  exact(
    input,
    ["id", "operationId", "objective", "executionRef"],
    "GoalDefinition",
  );
  return Object.freeze({
    id: identifier(input.id, "GoalDefinition id"),
    operationId: identifier(input.operationId, "GoalDefinition operationId"),
    objective: parseObjective(input.objective),
    executionRef: reference(
      input.executionRef,
      ["workflow", "capability"],
      "GoalDefinition executionRef",
    ) as GoalDefinition["executionRef"],
  });
}

function parseTrigger(value: unknown): Trigger {
  const input = record(value, "Trigger");
  const type = text(input.type, "Trigger type") as Trigger["type"];
  if (type === "manual") {
    exact(input, ["type"], "Trigger");
    return { type };
  }
  if (type === "schedule") {
    exact(input, ["type", "every", "at"], "Trigger");
    const at =
      input.at === undefined ? undefined : record(input.at, "Trigger at");
    if (at) exact(at, ["time", "timezone"], "Trigger at");
    return {
      type,
      every: text(input.every, "Trigger every"),
      ...(at
        ? {
            at: {
              time: text(at.time, "Trigger at time"),
              timezone: text(at.timezone, "Trigger at timezone"),
            },
          }
        : {}),
    };
  }
  if (type === "event" || type === "webhook") {
    exact(input, ["type", "event"], "Trigger");
    return { type, event: text(input.event, "Trigger event") };
  }
  if (type === "condition") {
    exact(input, ["type", "expression"], "Trigger");
    return { type, expression: text(input.expression, "Trigger expression") };
  }
  throw new Error("Trigger type is invalid");
}

export function createLoopDefinition(value: unknown): LoopDefinition {
  const input = record(value, "LoopDefinition");
  exact(
    input,
    [
      "id",
      "operationId",
      "objective",
      "trigger",
      "targetRef",
      "reconciliationPolicy",
    ],
    "LoopDefinition",
  );
  const policy = record(input.reconciliationPolicy, "ReconciliationPolicy");
  exact(policy, ["overlap", "missed", "failure"], "ReconciliationPolicy");
  if (policy.overlap !== "skip" && policy.overlap !== "queue")
    throw new Error("ReconciliationPolicy overlap is invalid");
  if (
    policy.missed !== "skip" &&
    policy.missed !== "replay" &&
    policy.missed !== "coalesce"
  )
    throw new Error("ReconciliationPolicy missed is invalid");
  const overlap =
    policy.overlap as LoopDefinition["reconciliationPolicy"]["overlap"];
  const missed =
    policy.missed as LoopDefinition["reconciliationPolicy"]["missed"];
  const failure = record(policy.failure, "ReconciliationPolicy failure");
  exact(
    failure,
    ["maxAttempts", "backoffSeconds", "timeoutSeconds"],
    "ReconciliationPolicy failure",
  );
  if (
    !Number.isInteger(failure.maxAttempts) ||
    (failure.maxAttempts as number) < 1
  )
    throw new Error("ReconciliationPolicy failure maxAttempts is invalid");
  if (typeof failure.backoffSeconds !== "number" || failure.backoffSeconds < 0)
    throw new Error("ReconciliationPolicy failure backoffSeconds is invalid");
  if (typeof failure.timeoutSeconds !== "number" || failure.timeoutSeconds <= 0)
    throw new Error("ReconciliationPolicy failure timeoutSeconds is invalid");
  return Object.freeze({
    id: identifier(input.id, "LoopDefinition id"),
    operationId: identifier(input.operationId, "LoopDefinition operationId"),
    objective: parseObjective(input.objective),
    trigger: parseTrigger(input.trigger),
    targetRef: reference(
      input.targetRef,
      ["goal", "workflow", "capability"],
      "LoopDefinition targetRef",
    ) as LoopDefinition["targetRef"],
    reconciliationPolicy: {
      overlap,
      missed,
      failure: {
        maxAttempts: failure.maxAttempts as number,
        backoffSeconds: failure.backoffSeconds as number,
        timeoutSeconds: failure.timeoutSeconds as number,
      },
    },
  });
}

export function createCapabilityDefinition(
  value: unknown,
): CapabilityDefinition {
  const input = record(value, "CapabilityDefinition");
  exact(
    input,
    [
      "id",
      "action",
      "purpose",
      "inputSchema",
      "outputSchema",
      "effects",
      "permissions",
      "success",
      "failure",
    ],
    "CapabilityDefinition",
  );
  return Object.freeze({
    id: identifier(input.id, "CapabilityDefinition id"),
    action: text(input.action, "CapabilityDefinition action"),
    purpose: text(input.purpose, "CapabilityDefinition purpose"),
    inputSchema: Object.freeze({
      ...record(input.inputSchema, "CapabilityDefinition inputSchema"),
    }),
    outputSchema: Object.freeze({
      ...record(input.outputSchema, "CapabilityDefinition outputSchema"),
    }),
    effects: strings(input.effects, "CapabilityDefinition effects"),
    permissions: strings(input.permissions, "CapabilityDefinition permissions"),
    success: text(input.success, "CapabilityDefinition success"),
    failure: text(input.failure, "CapabilityDefinition failure"),
  });
}

export function createImplementationDefinition(
  value: unknown,
): ImplementationDefinition {
  const input = record(value, "ImplementationDefinition");
  exact(
    input,
    ["id", "capabilityRef", "compatibleCapabilityRevision", "type", "agentRef"],
    "ImplementationDefinition",
  );
  const base = {
    id: identifier(input.id, "ImplementationDefinition id"),
    capabilityRef: reference(
      input.capabilityRef,
      ["capability"],
      "ImplementationDefinition capabilityRef",
    ) as ImplementationDefinition["capabilityRef"],
    compatibleCapabilityRevision: text(
      input.compatibleCapabilityRevision,
      "ImplementationDefinition compatibleCapabilityRevision",
    ),
  };
  if (input.type === "agent") {
    if (input.agentRef === undefined) {
      throw new Error("Agent ImplementationDefinition requires agentRef");
    }
    return Object.freeze({
      ...base,
      type: "agent",
      agentRef: reference(
        input.agentRef,
        ["agent"],
        "ImplementationDefinition agentRef",
      ) as Extract<ImplementationDefinition, { type: "agent" }>["agentRef"],
    });
  }
  if (input.type === "script") {
    if (input.agentRef !== undefined) {
      throw new Error("Script ImplementationDefinition cannot have agentRef");
    }
    return Object.freeze({ ...base, type: "script" });
  }
  throw new Error("ImplementationDefinition type is invalid");
}

export function createWorkflowDefinition(value: unknown): WorkflowDefinition {
  const input = record(value, "WorkflowDefinition");
  exact(input, ["id", "steps"], "WorkflowDefinition");
  if (!Array.isArray(input.steps) || input.steps.length === 0)
    throw new Error("WorkflowDefinition steps are required");
  const steps = input.steps.map((value) => {
    const step = record(value, "WorkflowStep");
    exact(
      step,
      ["id", "capabilityRef", "dependsOn", "input", "condition", "retry"],
      "WorkflowStep",
    );
    const retry =
      step.retry === undefined
        ? undefined
        : record(step.retry, "WorkflowStep retry");
    if (retry) {
      exact(retry, ["maxAttempts", "backoffSeconds"], "WorkflowStep retry");
      if (
        !Number.isInteger(retry.maxAttempts) ||
        (retry.maxAttempts as number) < 1
      ) {
        throw new Error("WorkflowStep retry maxAttempts is invalid");
      }
      if (
        typeof retry.backoffSeconds !== "number" ||
        retry.backoffSeconds < 0
      ) {
        throw new Error("WorkflowStep retry backoffSeconds is invalid");
      }
    }
    return {
      id: identifier(step.id, "WorkflowStep id"),
      capabilityRef: reference(
        step.capabilityRef,
        ["capability"],
        "WorkflowStep capabilityRef",
      ) as WorkflowStep["capabilityRef"],
      dependsOn:
        step.dependsOn === undefined
          ? []
          : strings(step.dependsOn, "WorkflowStep dependsOn"),
      ...(step.input !== undefined
        ? {
            input: Object.freeze({
              ...record(step.input, "WorkflowStep input"),
            }),
          }
        : {}),
      ...(step.condition !== undefined
        ? { condition: text(step.condition, "WorkflowStep condition") }
        : {}),
      ...(retry
        ? {
            retry: {
              maxAttempts: retry.maxAttempts as number,
              backoffSeconds: retry.backoffSeconds as number,
            },
          }
        : {}),
    };
  });
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length)
    throw new Error("WorkflowDefinition step ids must be unique");
  for (const step of steps) {
    const missing = step.dependsOn.find((dependency) => !ids.has(dependency));
    if (missing)
      throw new Error(
        `WorkflowStep "${step.id}" has missing dependency "${missing}"`,
      );
  }
  return Object.freeze({
    id: identifier(input.id, "WorkflowDefinition id"),
    steps,
  });
}

export function createIntentDefinition(value: unknown): IntentDefinition {
  const input = record(value, "IntentDefinition");
  exact(
    input,
    [
      "id",
      "direction",
      "description",
      "priority",
      "posture",
      "scope",
      "priorities",
      "measures",
      "policyRefs",
      "deliveryPolicy",
      "policy",
      "constraints",
    ],
    "IntentDefinition",
  );
  const priority = input.priority ?? 100;
  if (
    typeof priority !== "number" ||
    !Number.isFinite(priority) ||
    priority < 0
  ) {
    throw new Error("IntentDefinition priority must be a non-negative number");
  }
  const posture = input.posture ?? "balanced";
  if (
    posture !== "confidence" &&
    posture !== "speed" &&
    posture !== "stability-recovery" &&
    posture !== "maintenance" &&
    posture !== "balanced"
  ) {
    throw new Error("IntentDefinition posture is invalid");
  }
  const delivery = record(
    input.deliveryPolicy ?? {},
    "IntentDefinition deliveryPolicy",
  );
  exact(
    delivery,
    ["cadence", "assurance", "blockerSensitivity"],
    "IntentDefinition deliveryPolicy",
  );
  const cadence = (delivery.cadence ??
    "manual") as IntentDefinition["deliveryPolicy"]["cadence"];
  if (
    cadence !== "manual" &&
    cadence !== "15m" &&
    cadence !== "1d" &&
    cadence !== "1w"
  ) {
    throw new Error("IntentDefinition delivery cadence is invalid");
  }
  const assurance = (delivery.assurance ??
    "standard") as IntentDefinition["deliveryPolicy"]["assurance"];
  if (
    assurance !== "light" &&
    assurance !== "standard" &&
    assurance !== "strict"
  ) {
    throw new Error("IntentDefinition delivery assurance is invalid");
  }
  const blockerSensitivity = (delivery.blockerSensitivity ??
    "standard") as IntentDefinition["deliveryPolicy"]["blockerSensitivity"];
  if (
    blockerSensitivity !== "low" &&
    blockerSensitivity !== "standard" &&
    blockerSensitivity !== "strict"
  ) {
    throw new Error("IntentDefinition delivery blocker sensitivity is invalid");
  }
  return Object.freeze({
    id: identifier(input.id, "IntentDefinition id"),
    direction: text(input.direction, "IntentDefinition direction"),
    ...(input.description !== undefined
      ? { description: text(input.description, "IntentDefinition description") }
      : {}),
    priority,
    posture,
    scope: parseScope(input.scope ?? { include: {}, exclude: {} }),
    priorities: strings(input.priorities, "IntentDefinition priorities"),
    measures: strings(input.measures ?? [], "IntentDefinition measures"),
    policyRefs: strings(input.policyRefs ?? [], "IntentDefinition policyRefs"),
    deliveryPolicy: {
      cadence,
      assurance,
      blockerSensitivity,
    },
    policy: createPolicy(input.policy),
    constraints: parseConstraints(
      input.constraints,
      "IntentDefinition constraints",
    ),
  });
}

export function createAgentDefinition(value: unknown): AgentDefinition {
  const input = record(value, "AgentDefinition");
  exact(
    input,
    ["id", "name", "role", "permissions", "constraints"],
    "AgentDefinition",
  );
  return Object.freeze({
    id: identifier(input.id, "AgentDefinition id"),
    name: text(input.name, "AgentDefinition name"),
    role: text(input.role, "AgentDefinition role"),
    permissions: strings(input.permissions, "AgentDefinition permissions"),
    constraints: parseConstraints(
      input.constraints,
      "AgentDefinition constraints",
    ),
  });
}

export function createOperationDefinition(value: unknown): OperationDefinition {
  const input = record(value, "OperationDefinition");
  exact(
    input,
    ["id", "name", "responsibility", "doesNotOwn", "intentIds"],
    "OperationDefinition",
  );
  return Object.freeze({
    id: identifier(input.id, "OperationDefinition id"),
    name: text(input.name, "OperationDefinition name"),
    responsibility: text(
      input.responsibility,
      "OperationDefinition responsibility",
    ),
    doesNotOwn: strings(
      input.doesNotOwn ?? [],
      "OperationDefinition doesNotOwn",
    ),
    intentIds: strings(input.intentIds, "OperationDefinition intentIds"),
  });
}

const LIFECYCLES: readonly Lifecycle[] = [
  "draft",
  "active",
  "paused",
  "retired",
  "archived",
];
function lifecycle(value: unknown): Lifecycle {
  if (typeof value !== "string" || !LIFECYCLES.includes(value as Lifecycle))
    throw new Error("Lifecycle is invalid");
  return value as Lifecycle;
}

const LIFECYCLE_TRANSITIONS: Readonly<Record<Lifecycle, readonly Lifecycle[]>> =
  {
    draft: ["active", "retired"],
    active: ["paused", "retired"],
    paused: ["active", "retired"],
    retired: ["archived", "active"],
    archived: ["active"],
  };
export function assertLifecycleTransition(
  from: Lifecycle,
  to: Lifecycle,
): Lifecycle {
  if (!LIFECYCLE_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid lifecycle transition from "${from}" to "${to}"`);
  }
  return to;
}

function createSimpleState(
  value: unknown,
  label: "IntentState" | "OperationState",
): IntentState | OperationState {
  const input = record(value, label);
  exact(input, ["definitionId", "lifecycle", "updatedAt"], label);
  return {
    definitionId: identifier(input.definitionId, `${label} definitionId`),
    lifecycle: lifecycle(input.lifecycle),
    updatedAt: timestamp(input.updatedAt, `${label} updatedAt`),
  };
}

export function createIntentState(value: unknown): IntentState {
  return createSimpleState(value, "IntentState");
}

export function createOperationState(value: unknown): OperationState {
  return createSimpleState(value, "OperationState");
}

export function createGoalState(value: unknown): GoalState {
  const input = record(value, "GoalState");
  exact(
    input,
    ["definitionId", "lifecycle", "progress", "blockers", "updatedAt"],
    "GoalState",
  );
  if (
    typeof input.progress !== "number" ||
    input.progress < 0 ||
    input.progress > 1
  )
    throw new Error("GoalState progress must be between 0 and 1");
  return {
    definitionId: identifier(input.definitionId, "GoalState definitionId"),
    lifecycle: lifecycle(input.lifecycle),
    progress: input.progress,
    blockers: strings(input.blockers, "GoalState blockers"),
    updatedAt: timestamp(input.updatedAt, "GoalState updatedAt"),
  };
}

export function createLoopState(value: unknown): LoopState {
  const input = record(value, "LoopState");
  exact(
    input,
    [
      "definitionId",
      "lifecycle",
      "health",
      "failures",
      "lastFiredAt",
      "nextEligibleAt",
      "updatedAt",
    ],
    "LoopState",
  );
  const health = input.health;
  if (
    health !== "unknown" &&
    health !== "healthy" &&
    health !== "degraded" &&
    health !== "failing"
  )
    throw new Error("LoopState health is invalid");
  if (!Number.isInteger(input.failures) || (input.failures as number) < 0)
    throw new Error("LoopState failures is invalid");
  return {
    definitionId: identifier(input.definitionId, "LoopState definitionId"),
    lifecycle: lifecycle(input.lifecycle),
    health,
    failures: input.failures as number,
    ...(input.lastFiredAt
      ? { lastFiredAt: timestamp(input.lastFiredAt, "LoopState lastFiredAt") }
      : {}),
    ...(input.nextEligibleAt
      ? {
          nextEligibleAt: timestamp(
            input.nextEligibleAt,
            "LoopState nextEligibleAt",
          ),
        }
      : {}),
    updatedAt: timestamp(input.updatedAt, "LoopState updatedAt"),
  };
}

export function createRun(value: unknown): Run {
  const input = record(value, "Run");
  exact(
    input,
    [
      "id",
      "status",
      "origin",
      "target",
      "trace",
      "execution",
      "parentRunId",
      "effectivePolicy",
      "correlationId",
      "startedAt",
      "finishedAt",
      "usage",
    ],
    "Run",
  );
  const statuses: Run["status"][] = [
    "queued",
    "running",
    "succeeded",
    "failed",
    "cancelled",
  ];
  if (
    typeof input.status !== "string" ||
    !statuses.includes(input.status as Run["status"])
  )
    throw new Error("Run status is invalid");
  const terminal =
    input.status === "succeeded" ||
    input.status === "failed" ||
    input.status === "cancelled";
  if (terminal && !input.finishedAt)
    throw new Error("Terminal Run requires finishedAt");
  if (!terminal && input.finishedAt)
    throw new Error("Active Run cannot have finishedAt");
  if (!Array.isArray(input.trace) || input.trace.length === 0)
    throw new Error("Run trace is required");
  if (input.usage !== undefined && !terminal)
    throw new Error("Only a terminal Run can record usage");
  const usage =
    input.usage === undefined ? undefined : record(input.usage, "Run usage");
  if (usage) {
    exact(usage, ["tokens", "costUsd", "durationSeconds"], "Run usage");
    for (const field of ["tokens", "costUsd", "durationSeconds"] as const) {
      if (
        typeof usage[field] !== "number" ||
        usage[field] < 0 ||
        !Number.isFinite(usage[field])
      )
        throw new Error(`Run usage ${field} is invalid`);
    }
  }
  const effectivePolicy = record(input.effectivePolicy, "Run effectivePolicy");
  exact(
    effectivePolicy,
    ["hash", "policy", "constraints"],
    "Run effectivePolicy",
  );
  const run: Run = {
    id: identifier(input.id, "Run id"),
    status: input.status as Run["status"],
    origin: pinnedReference(
      input.origin,
      ["intent", "operation", "goal", "loop"],
      "Run origin",
    ),
    target: pinnedReference(
      input.target,
      ["goal", "workflow", "capability"],
      "Run target",
    ),
    trace: input.trace.map((item) =>
      pinnedReference(
        item,
        [
          "intent",
          "operation",
          "goal",
          "loop",
          "workflow",
          "capability",
          "implementation",
          "agent",
        ],
        "Run trace item",
      ),
    ),
    ...(input.execution !== undefined
      ? {
          execution: parseRunExecution(input.execution),
        }
      : {}),
    ...(input.parentRunId !== undefined
      ? { parentRunId: identifier(input.parentRunId, "Run parentRunId") }
      : {}),
    effectivePolicy: Object.freeze({
      hash: text(effectivePolicy.hash, "Run effectivePolicy hash"),
      policy: createPolicy(effectivePolicy.policy),
      constraints: parseConstraints(
        effectivePolicy.constraints,
        "Run effectivePolicy constraints",
      ),
    }),
    correlationId: identifier(input.correlationId, "Run correlationId"),
    startedAt: timestamp(input.startedAt, "Run startedAt"),
    ...(input.finishedAt
      ? { finishedAt: timestamp(input.finishedAt, "Run finishedAt") }
      : {}),
    ...(usage
      ? {
          usage: {
            tokens: usage.tokens as number,
            costUsd: usage.costUsd as number,
            durationSeconds: usage.durationSeconds as number,
          },
        }
      : {}),
  };
  return terminal ? Object.freeze(run) : run;
}

function parseRunExecution(value: unknown): NonNullable<Run["execution"]> {
  const input = record(value, "Run execution");
  exact(input, ["capability", "implementation"], "Run execution");
  return Object.freeze({
    capability: pinnedReference(
      input.capability,
      ["capability"],
      "Run execution capability",
    ) as NonNullable<Run["execution"]>["capability"],
    implementation: pinnedReference(
      input.implementation,
      ["implementation"],
      "Run execution implementation",
    ) as NonNullable<Run["execution"]>["implementation"],
  });
}

export function createRunOutput(value: unknown): RunOutput {
  const input = record(value, "RunOutput");
  exact(
    input,
    [
      "kind",
      "key",
      "value",
      "runId",
      "producer",
      "parentRef",
      "contract",
      "createdAt",
    ],
    "RunOutput",
  );
  if (
    input.kind !== "fact" &&
    input.kind !== "evidence" &&
    input.kind !== "artifact"
  )
    throw new Error("RunOutput kind is invalid");
  return Object.freeze({
    kind: input.kind,
    key: text(input.key, "RunOutput key"),
    value: input.value,
    runId: identifier(input.runId, "RunOutput runId"),
    producer: reference(
      input.producer,
      ["agent", "workflow", "capability"],
      "RunOutput producer",
    ),
    ...(input.parentRef !== undefined
      ? {
          parentRef: pinnedReference(
            input.parentRef,
            ["goal", "loop"],
            "RunOutput parentRef",
          ) as RunOutput["parentRef"],
        }
      : {}),
    contract: text(input.contract, "RunOutput contract"),
    createdAt: timestamp(input.createdAt, "RunOutput createdAt"),
  });
}

export interface RelationshipCatalog {
  operations: readonly string[];
  goals: readonly string[];
  workflows: readonly string[];
  capabilities: readonly string[];
}
export function relationshipIssues(
  definition: GoalDefinition | LoopDefinition,
  catalog: RelationshipCatalog,
): string[] {
  const issues: string[] = [];
  if (!catalog.operations.includes(definition.operationId))
    issues.push(`Missing Operation "${definition.operationId}"`);
  const target =
    "executionRef" in definition
      ? definition.executionRef
      : definition.targetRef;
  const collection =
    target.kind === "goal"
      ? catalog.goals
      : target.kind === "workflow"
        ? catalog.workflows
        : catalog.capabilities;
  if (!collection.includes(target.id))
    issues.push(
      `Missing ${target.kind[0]!.toUpperCase()}${target.kind.slice(1)} "${target.id}"`,
    );
  return issues;
}

export interface DomainRelationship {
  owner: DefinitionRef;
  field: string;
  target: DefinitionRef;
}
export function deletionIssues(
  target: DefinitionRef,
  relationships: readonly DomainRelationship[],
): string[] {
  return relationships
    .filter(
      (relationship) =>
        relationship.target.kind === target.kind &&
        relationship.target.id === target.id,
    )
    .map((relationship) => {
      const owner = `${relationship.owner.kind[0]!.toUpperCase()}${relationship.owner.kind.slice(1)}`;
      return `Referenced by ${owner} "${relationship.owner.id}" through ${relationship.field}`;
    });
}
