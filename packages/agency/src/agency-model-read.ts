import type {
  GoalDefinition,
  Lifecycle,
  LoopDefinition,
  OperationDefinition,
} from "@kody-ade/agency-domain";

import type {
  AgencyDefinitionKind,
  StoredAgencyDefinition,
  StoredAgencyState,
} from "./backend/agency-model-store";

type StatefulDefinitionKind = StoredAgencyState["kind"];

function isNewer(
  candidate: StoredAgencyDefinition,
  current: StoredAgencyDefinition,
): boolean {
  const timeComparison = candidate.createdAt.localeCompare(current.createdAt);
  return timeComparison > 0 ||
    (timeComparison === 0 &&
      candidate.recordId.localeCompare(current.recordId) > 0);
}

export function currentAgencyDefinitions(
  records: readonly StoredAgencyDefinition[],
): StoredAgencyDefinition[] {
  const current = new Map<string, StoredAgencyDefinition>();
  for (const record of records) {
    const key = `${record.kind}:${record.data.id}`;
    const existing = current.get(key);
    if (!existing || isNewer(record, existing)) current.set(key, record);
  }
  return [...current.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.data.id.localeCompare(right.data.id),
  );
}

export function currentAgencyDefinition(
  records: readonly StoredAgencyDefinition[],
  kind: AgencyDefinitionKind,
  id: string,
): StoredAgencyDefinition | undefined {
  return currentAgencyDefinitions(records).find(
    (record) => record.kind === kind && record.data.id === id,
  );
}

export function currentAgencyState(
  records: readonly StoredAgencyState[],
  kind: StatefulDefinitionKind,
  definitionId: string,
): StoredAgencyState | undefined {
  return records.find(
    (record) =>
      record.kind === kind && record.definitionId === definitionId,
  );
}

function lifecycleOf(
  states: readonly StoredAgencyState[],
  kind: StatefulDefinitionKind,
  definitionId: string,
): Lifecycle | undefined {
  const lifecycle = currentAgencyState(states, kind, definitionId)?.data
    .lifecycle;
  return typeof lifecycle === "string"
    ? (lifecycle as Lifecycle)
    : undefined;
}

export function operationReadiness(
  records: readonly StoredAgencyDefinition[],
  states: readonly StoredAgencyState[],
  operationId: string,
): {
  operation: OperationDefinition | null;
  goals: string[];
  loops: string[];
  issues: string[];
} {
  const definitions = currentAgencyDefinitions(records);
  const operationRecord = definitions.find(
    (record) =>
      record.kind === "operation" && record.data.id === operationId,
  );
  if (!operationRecord) {
    return {
      operation: null,
      goals: [],
      loops: [],
      issues: ["Operation not found"],
    };
  }
  const operation = operationRecord.data as unknown as OperationDefinition;
  const issues: string[] = [];
  if (lifecycleOf(states, "operation", operationId) !== "active") {
    issues.push("Operation is not active");
  }
  const intentIds = new Set(
    definitions
      .filter((record) => record.kind === "intent")
      .map((record) => record.data.id),
  );
  for (const intentId of operation.intentIds) {
    if (!intentIds.has(intentId)) issues.push(`Missing Intent "${intentId}"`);
  }
  const goals = definitions
    .filter(
      (record) =>
        record.kind === "goal" &&
        (record.data as unknown as GoalDefinition).operationId === operationId,
    )
    .map((record) => record.data.id)
    .sort();
  const loops = definitions
    .filter(
      (record) =>
        record.kind === "loop" &&
        (record.data as unknown as LoopDefinition).operationId === operationId,
    )
    .map((record) => record.data.id)
    .sort();
  return { operation, goals, loops, issues };
}
