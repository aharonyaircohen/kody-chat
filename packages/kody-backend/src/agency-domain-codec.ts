import {
  createAgentDefinition,
  createCapabilityDefinition,
  createGoalDefinition,
  createIntentDefinition,
  createLoopDefinition,
  createOperationDefinition,
  createWorkflowDefinition,
  type CapabilityDefinition,
  type AgentDefinition,
  type GoalDefinition,
  type IntentDefinition,
  type LoopDefinition,
  type OperationDefinition,
  type WorkflowDefinition,
} from "@kody-ade/agency-domain";

export type AgencyDefinitionKind =
  "intent" | "operation" | "goal" | "loop" | "workflow" | "capability" | "agent";
export type AgencyDefinition =
  | AgentDefinition
  | IntentDefinition
  | OperationDefinition
  | GoalDefinition
  | LoopDefinition
  | WorkflowDefinition
  | CapabilityDefinition;

export interface AgencyDefinitionEnvelope {
  schemaVersion: number;
  recordId: string;
  kind: AgencyDefinitionKind;
  data: AgencyDefinition;
}

const CURRENT_SCHEMA_VERSION = 1;
const RECORD_ID = /^[a-z][a-z0-9-]{0,127}$/;

function decodeData(
  kind: AgencyDefinitionKind,
  data: unknown,
): AgencyDefinition {
  if (kind === "intent") return createIntentDefinition(data);
  if (kind === "operation") return createOperationDefinition(data);
  if (kind === "goal") return createGoalDefinition(data);
  if (kind === "loop") return createLoopDefinition(data);
  if (kind === "workflow") return createWorkflowDefinition(data);
  if (kind === "agent") return createAgentDefinition(data);
  return createCapabilityDefinition(data);
}

export function encodeAgencyDefinition(
  kind: AgencyDefinitionKind,
  recordId: string,
  data: unknown,
): AgencyDefinitionEnvelope {
  if (!RECORD_ID.test(recordId)) throw new Error("Invalid agency record id");
  return Object.freeze({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    recordId,
    kind,
    data: decodeData(kind, data),
  });
}

export function decodeAgencyDefinition(value: unknown): AgencyDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid agency definition envelope");
  }
  const envelope = value as Partial<AgencyDefinitionEnvelope>;
  if (envelope.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported agency schema version "${String(envelope.schemaVersion)}"`,
    );
  }
  if (!envelope.recordId || !RECORD_ID.test(envelope.recordId)) {
    throw new Error("Invalid agency record id");
  }
  if (
    envelope.kind !== "intent" &&
    envelope.kind !== "operation" &&
    envelope.kind !== "goal" &&
    envelope.kind !== "loop" &&
    envelope.kind !== "workflow" &&
    envelope.kind !== "capability" &&
    envelope.kind !== "agent"
  ) {
    throw new Error("Invalid agency definition kind");
  }
  return decodeData(envelope.kind, envelope.data);
}
