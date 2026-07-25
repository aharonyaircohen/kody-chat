export type ReferenceKind =
  "todo" | "loop" | "workflow" | "capability" | "agent";

export interface DefinitionRef {
  kind: ReferenceKind;
  id: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  instructions: string;
  permissions: string[];
}

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
  agent: string;
  steps: WorkflowStep[];
}

export type TodoStatus = "todo" | "in-progress" | "blocked" | "done";

export interface TodoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Todo {
  id: string;
  outcome: string;
  status: TodoStatus;
  evidence: string[];
  checklist: TodoChecklistItem[];
  blockers: string[];
  runIds: string[];
}

export type Trigger =
  | { type: "manual" }
  | { type: "schedule"; every: string; at?: { time: string; timezone: string } }
  | { type: "event"; event: string }
  | { type: "webhook"; event: string }
  | { type: "condition"; expression: string };

export interface LoopDefinition {
  id: string;
  trigger: Trigger;
  target: DefinitionRef & { kind: "workflow" | "capability" };
  input: Readonly<Record<string, unknown>>;
  enabled: boolean;
}

export interface Run {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  target: DefinitionRef & { kind: "workflow" | "capability" };
  agent: string;
  todoId?: string;
  parentRunId?: string;
  startedAt: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
}

export interface DomainRelationship {
  owner: DefinitionRef;
  field: string;
  target: DefinitionRef;
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
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function identifier(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ID.test(result)) throw new Error(`${label} is invalid`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (Number.isNaN(Date.parse(result))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
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

function jsonObject(value: unknown, label: string): Readonly<UnknownRecord> {
  return Object.freeze({ ...record(value, label) });
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
  return Object.freeze({
    kind: input.kind as ReferenceKind,
    id: identifier(input.id, `${label}.id`),
  });
}

export function createAgentDefinition(value: unknown): AgentDefinition {
  const input = record(value, "Agent");
  exact(input, ["id", "name", "instructions", "permissions"], "Agent");
  return Object.freeze({
    id: identifier(input.id, "Agent id"),
    name: text(input.name, "Agent name"),
    instructions: text(input.instructions, "Agent instructions"),
    permissions: strings(input.permissions, "Agent permissions"),
  });
}

export function createWorkflowDefinition(value: unknown): WorkflowDefinition {
  const input = record(value, "Workflow");
  exact(input, ["id", "agent", "steps"], "Workflow");
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("Workflow steps are required");
  }
  const steps = input.steps.map((value) => {
    const step = record(value, "Workflow step");
    exact(
      step,
      ["id", "capabilityRef", "dependsOn", "input", "condition", "retry"],
      "Workflow step",
    );
    const retry =
      step.retry === undefined ? undefined : record(step.retry, "Step retry");
    if (retry) {
      exact(retry, ["maxAttempts", "backoffSeconds"], "Step retry");
      if (
        !Number.isInteger(retry.maxAttempts) ||
        Number(retry.maxAttempts) < 1 ||
        typeof retry.backoffSeconds !== "number" ||
        retry.backoffSeconds < 0
      ) {
        throw new Error("Step retry is invalid");
      }
    }
    return Object.freeze({
      id: identifier(step.id, "Workflow step id"),
      capabilityRef: reference(
        step.capabilityRef,
        ["capability"],
        "Workflow step capability",
      ) as WorkflowStep["capabilityRef"],
      dependsOn:
        step.dependsOn === undefined
          ? []
          : strings(step.dependsOn, "Workflow step dependencies"),
      ...(step.input === undefined
        ? {}
        : { input: jsonObject(step.input, "Workflow step input") }),
      ...(step.condition === undefined
        ? {}
        : { condition: text(step.condition, "Workflow step condition") }),
      ...(retry
        ? {
            retry: {
              maxAttempts: Number(retry.maxAttempts),
              backoffSeconds: retry.backoffSeconds as number,
            },
          }
        : {}),
    });
  });
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length)
    throw new Error("Workflow step ids must be unique");
  for (const step of steps) {
    const missing = step.dependsOn.find((dependency) => !ids.has(dependency));
    if (missing) {
      throw new Error(
        `Workflow step "${step.id}" has missing dependency "${missing}"`,
      );
    }
  }
  return Object.freeze({
    id: identifier(input.id, "Workflow id"),
    agent: identifier(input.agent, "Workflow agent"),
    steps,
  });
}

export function createTodo(value: unknown): Todo {
  const input = record(value, "Todo");
  exact(
    input,
    [
      "id",
      "outcome",
      "status",
      "evidence",
      "checklist",
      "blockers",
      "runIds",
    ],
    "Todo",
  );
  const statuses: TodoStatus[] = [
    "todo",
    "in-progress",
    "blocked",
    "done",
  ];
  if (!statuses.includes(input.status as TodoStatus)) {
    throw new Error("Todo status is invalid");
  }
  return Object.freeze({
    id: identifier(input.id, "Todo id"),
    outcome: text(input.outcome, "Todo outcome"),
    status: input.status as TodoStatus,
    evidence: strings(input.evidence, "Todo evidence"),
    checklist: (() => {
      if (!Array.isArray(input.checklist)) {
        throw new Error("Todo checklist must be an array");
      }
      return input.checklist.map((value) => {
        const item = record(value, "Todo checklist item");
        exact(item, ["id", "text", "done"], "Todo checklist item");
        if (typeof item.done !== "boolean") {
          throw new Error("Todo checklist item done must be a boolean");
        }
        return Object.freeze({
          id: identifier(item.id, "Todo checklist item id"),
          text: text(item.text, "Todo checklist item text"),
          done: item.done,
        });
      });
    })(),
    blockers: strings(input.blockers, "Todo blockers"),
    runIds: strings(input.runIds, "Todo runIds"),
  });
}

function trigger(value: unknown): Trigger {
  const input = record(value, "Loop trigger");
  const type = text(input.type, "Loop trigger type");
  if (type === "manual") {
    exact(input, ["type"], "Loop trigger");
    return Object.freeze({ type });
  }
  if (type === "schedule") {
    exact(input, ["type", "every", "at"], "Loop trigger");
    if (input.at === undefined) {
      return Object.freeze({
        type,
        every: text(input.every, "Loop trigger every"),
      });
    }
    const at = record(input.at, "Loop trigger at");
    exact(at, ["time", "timezone"], "Loop trigger at");
    return Object.freeze({
      type,
      every: text(input.every, "Loop trigger every"),
      at: {
        time: text(at.time, "Loop trigger time"),
        timezone: text(at.timezone, "Loop trigger timezone"),
      },
    });
  }
  if (type === "event" || type === "webhook") {
    exact(input, ["type", "event"], "Loop trigger");
    return Object.freeze({
      type,
      event: text(input.event, "Loop trigger event"),
    });
  }
  if (type === "condition") {
    exact(input, ["type", "expression"], "Loop trigger");
    return Object.freeze({
      type,
      expression: text(input.expression, "Loop trigger expression"),
    });
  }
  throw new Error("Loop trigger type is invalid");
}

export function createLoopDefinition(value: unknown): LoopDefinition {
  const input = record(value, "Loop");
  exact(input, ["id", "trigger", "target", "input", "enabled"], "Loop");
  if (typeof input.enabled !== "boolean") {
    throw new Error("Loop enabled must be a boolean");
  }
  return Object.freeze({
    id: identifier(input.id, "Loop id"),
    trigger: trigger(input.trigger),
    target: reference(
      input.target,
      ["workflow", "capability"],
      "Loop target",
    ) as LoopDefinition["target"],
    input: jsonObject(input.input, "Loop input"),
    enabled: input.enabled,
  });
}

export function createRun(value: unknown): Run {
  const input = record(value, "Run");
  exact(
    input,
    [
      "id",
      "status",
      "target",
      "agent",
      "todoId",
      "parentRunId",
      "startedAt",
      "finishedAt",
      "output",
      "error",
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
  if (!statuses.includes(input.status as Run["status"])) {
    throw new Error("Run status is invalid");
  }
  const run: Run = {
    id: identifier(input.id, "Run id"),
    status: input.status as Run["status"],
    target: reference(
      input.target,
      ["workflow", "capability"],
      "Run target",
    ) as Run["target"],
    agent: identifier(input.agent, "Run agent"),
    ...(input.todoId === undefined
      ? {}
      : { todoId: identifier(input.todoId, "Run todoId") }),
    ...(input.parentRunId === undefined
      ? {}
      : { parentRunId: identifier(input.parentRunId, "Run parentRunId") }),
    startedAt: timestamp(input.startedAt, "Run startedAt"),
    ...(input.finishedAt === undefined
      ? {}
      : { finishedAt: timestamp(input.finishedAt, "Run finishedAt") }),
    ...(input.output === undefined ? {} : { output: input.output }),
    ...(input.error === undefined
      ? {}
      : { error: text(input.error, "Run error") }),
  };
  return Object.freeze(run);
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
