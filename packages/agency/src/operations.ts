/**
 * @fileType utility
 * @domain agency-operations
 * @pattern operation-contract
 * @ai-summary Minimal persisted boundary that groups Goals and Loops under one
 *   durable responsibility. Shared Agents, Workflows, and Capabilities remain
 *   outside the Operation and are resolved through its owned work.
 */

import { slugifyTitle } from "@kody-ade/base/slug";

export const OPERATION_STATUSES = [
  "proposed",
  "provisioning",
  "active",
  "paused",
  "retired",
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface Operation {
  version: 1;
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string[];
  intentIds: string[];
  goals: string[];
  loops: string[];
  status: OperationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOperationInput {
  id: string;
  name: string;
  responsibility: string;
  doesNotOwn: string[];
  intentIds: string[];
  goals: string[];
  loops: string[];
  status?: OperationStatus;
}

export interface OperationCatalog {
  intents: readonly string[];
  goals: readonly string[];
  loops: readonly string[];
}

const OPERATION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

export function isOperationId(value: string): boolean {
  return OPERATION_ID_PATTERN.test(value);
}

export function slugifyOperationId(value: string): string {
  const slug = slugifyTitle(value, { allowUnderscore: false });
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug.slice(0, 64) : `o-${slug}`.slice(0, 64);
}

export function operationPath(id: string): string {
  assertId("Operation", id);
  return `operations/${id}/operation.json`;
}

export function buildOperation(
  input: CreateOperationInput,
  now = new Date().toISOString(),
): Operation {
  return parseOperation(operationPath(input.id), {
    version: 1,
    ...input,
    status: input.status ?? "proposed",
    createdAt: now,
    updatedAt: now,
  });
}

export function parseOperation(path: string, value: unknown): Operation {
  const input = recordField(value);
  if (!input) {
    throw new Error(`Invalid Operation at ${path}: expected object`);
  }
  if (input.version !== 1) {
    throw new Error(`Invalid Operation version at ${path}`);
  }

  const pathId = operationIdFromPath(path);
  const id = requiredString(input.id, "Operation id is required");
  assertId("Operation", id);
  if (id !== pathId) {
    throw new Error(`Operation id "${id}" does not match path id "${pathId}"`);
  }

  const name = requiredString(input.name, "Operation name is required");
  const responsibility = requiredString(
    input.responsibility,
    "Operation responsibility is required",
  );
  const doesNotOwn = uniqueText(input.doesNotOwn);
  if (doesNotOwn.length === 0) {
    throw new Error("Operation must define what it does not own");
  }

  const intentIds = uniqueIds(input.intentIds, "Intent");
  if (intentIds.length === 0) {
    throw new Error("Operation must link at least one Intent");
  }
  const goals = uniqueIds(input.goals, "Goal");
  const loops = uniqueIds(input.loops, "Loop");
  const loopIds = new Set(loops);
  for (const goalId of goals) {
    if (loopIds.has(goalId)) {
      throw new Error(
        `Operation item "${goalId}" cannot be both a Goal and Loop`,
      );
    }
  }

  const status = operationStatus(input.status);

  return {
    version: 1,
    id,
    name,
    responsibility,
    doesNotOwn,
    intentIds,
    goals,
    loops,
    status,
    createdAt: isoTimestamp(input.createdAt, "createdAt"),
    updatedAt: isoTimestamp(input.updatedAt, "updatedAt"),
  };
}

export function operationActivationIssues(
  operation: Operation,
  catalog: OperationCatalog,
): string[] {
  if (operation.goals.length === 0 && operation.loops.length === 0) {
    return ["Operation must own at least one Goal or Loop"];
  }

  const availableIntents = new Set(catalog.intents);
  const availableGoals = new Set(catalog.goals);
  const availableLoops = new Set(catalog.loops);
  return [
    ...operation.intentIds
      .filter((id) => !availableIntents.has(id))
      .map((id) => `Missing Intent "${id}"`),
    ...operation.goals
      .filter((id) => !availableGoals.has(id))
      .map((id) => `Missing Goal "${id}"`),
    ...operation.loops
      .filter((id) => !availableLoops.has(id))
      .map((id) => `Missing Loop "${id}"`),
  ];
}

export function canActivateOperation(
  operation: Operation,
  catalog: OperationCatalog,
): boolean {
  return operationActivationIssues(operation, catalog).length === 0;
}

export function operationOwnershipIssues(
  operation: Operation,
  operations: readonly Operation[],
): string[] {
  const others = operations.filter(
    (candidate) => candidate.id !== operation.id,
  );
  const issues: string[] = [];
  for (const goalId of operation.goals) {
    const owner = others.find((candidate) => candidate.goals.includes(goalId));
    if (owner) {
      issues.push(
        `Goal "${goalId}" is already owned by Operation "${owner.id}"`,
      );
    }
  }
  for (const loopId of operation.loops) {
    const owner = others.find((candidate) => candidate.loops.includes(loopId));
    if (owner) {
      issues.push(
        `Loop "${loopId}" is already owned by Operation "${owner.id}"`,
      );
    }
  }
  return issues;
}

function operationIdFromPath(path: string): string {
  const match = path.match(/(?:^|\/)operations\/([^/]+)\/operation\.json$/);
  const id = match?.[1] ?? "";
  assertId("Operation path", id);
  return id;
}

function operationStatus(value: unknown): OperationStatus {
  if (
    typeof value !== "string" ||
    !OPERATION_STATUSES.includes(value as OperationStatus)
  ) {
    throw new Error(
      `Invalid Operation status "${typeof value === "string" ? value : ""}"`,
    );
  }
  return value as OperationStatus;
}

function uniqueIds(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Operation ${label} references must be an array`);
  }

  const ids = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`Invalid ${label} id ""`);
    }
    const id = item.trim();
    assertId(label, id);
    return id;
  });
  return [...new Set(ids)];
}

function uniqueText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function isoTimestamp(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`Operation ${field} must be an ISO timestamp`);
  }
  return value;
}

function assertId(label: string, id: string): void {
  if (!isOperationId(id)) {
    throw new Error(`Invalid ${label} id "${id}"`);
  }
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
