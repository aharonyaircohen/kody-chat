import type {
  AgentDefinition,
  CapabilityDefinition,
  GoalDefinition,
  GoalState,
  IntentDefinition,
  LoopDefinition,
  LoopState,
  OperationDefinition,
  WorkflowDefinition,
} from "@kody-ade/agency-domain";
import { API_BASE, buildHeaders, handleResponse } from "./client";

export type AgencyDefinitionData =
  | IntentDefinition
  | OperationDefinition
  | GoalDefinition
  | LoopDefinition
  | WorkflowDefinition
  | CapabilityDefinition
  | AgentDefinition;

export type AgencyDefinitionRecord = {
  recordId: string;
  kind:
    | "intent"
    | "operation"
    | "goal"
    | "loop"
    | "workflow"
    | "capability"
    | "agent";
  schemaVersion: number;
  data: AgencyDefinitionData;
  createdAt: string;
};

export type AgencyStateRecord = {
  definitionId: string;
  kind: "goal" | "loop";
  schemaVersion: number;
  data: GoalState | LoopState;
  updatedAt: string;
};

export const agencyModelApi = {
  definitions: async (): Promise<AgencyDefinitionRecord[]> => {
    const response = await fetch(`${API_BASE}/agency-definitions`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return (await handleResponse<{ definitions: AgencyDefinitionRecord[] }>(
      response,
    )).definitions;
  },
  states: async (): Promise<AgencyStateRecord[]> => {
    const response = await fetch(`${API_BASE}/agency-states`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return (await handleResponse<{ states: AgencyStateRecord[] }>(response))
      .states;
  },
  putState: async (
    kind: "goal" | "loop",
    state: GoalState | LoopState,
  ): Promise<GoalState | LoopState> => {
    const response = await fetch(`${API_BASE}/agency-states`, {
      method: "PUT",
      headers: buildHeaders(),
      body: JSON.stringify({ kind, state }),
    });
    return (await handleResponse<{ state: GoalState | LoopState }>(response))
      .state;
  },
};
