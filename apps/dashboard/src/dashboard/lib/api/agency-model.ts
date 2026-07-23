import type {
  AgentDefinition,
  CapabilityDefinition,
  GoalDefinition,
  GoalState,
  IntentState,
  IntentDefinition,
  ImplementationDefinition,
  LoopDefinition,
  LoopState,
  OperationState,
  OperationDefinition,
  WorkflowDefinition,
  Run,
  RunOutput,
} from "@kody-ade/agency-domain";
import { API_BASE, buildHeaders, handleResponse } from "./client";

export type AgencyDefinitionData =
  | IntentDefinition
  | OperationDefinition
  | GoalDefinition
  | LoopDefinition
  | WorkflowDefinition
  | CapabilityDefinition
  | ImplementationDefinition
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
    | "implementation"
    | "agent";
  schemaVersion: number;
  data: AgencyDefinitionData;
  createdAt: string;
};

export type AgencyStateRecord = {
  definitionId: string;
  kind: "intent" | "operation" | "goal" | "loop";
  schemaVersion: number;
  data: IntentState | OperationState | GoalState | LoopState;
  updatedAt: string;
};

export type AgencyObservations = {
  runs: Array<{
    runId: string;
    subjectType: "goal" | "loop" | "workflow" | "capability";
    subjectId: string;
    run: Run;
    updatedAt: string;
  }>;
  outputs: Array<{
    recordId: string;
    runId: string;
    schemaVersion: number;
    data: RunOutput;
  }>;
};

export const agencyModelApi = {
  migrate: async (): Promise<{ created: number; reused: number }> => {
    const response = await fetch(`${API_BASE}/agency-migration`, {
      method: "POST",
      headers: buildHeaders(),
    });
    return await handleResponse<{ created: number; reused: number }>(response);
  },
  definitions: async (): Promise<AgencyDefinitionRecord[]> => {
    const response = await fetch(`${API_BASE}/agency-definitions`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return (
      await handleResponse<{ definitions: AgencyDefinitionRecord[] }>(response)
    ).definitions;
  },
  createDefinition: async <T extends AgencyDefinitionData>(
    kind: AgencyDefinitionRecord["kind"],
    definition: T,
  ): Promise<T> => {
    const response = await fetch(`${API_BASE}/agency-definitions`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ kind, definition }),
    });
    return (await handleResponse<{ definition: T }>(response)).definition;
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
    kind: "intent" | "operation" | "goal" | "loop",
    state: IntentState | OperationState | GoalState | LoopState,
  ): Promise<IntentState | OperationState | GoalState | LoopState> => {
    const response = await fetch(`${API_BASE}/agency-states`, {
      method: "PUT",
      headers: buildHeaders(),
      body: JSON.stringify({ kind, state }),
    });
    return (
      await handleResponse<{
        state: IntentState | OperationState | GoalState | LoopState;
      }>(response)
    ).state;
  },
  applyChange: async (change: {
    definitions: Array<{
      kind: AgencyDefinitionRecord["kind"];
      definition: AgencyDefinitionData;
    }>;
    states: Array<{
      kind: AgencyStateRecord["kind"];
      state: IntentState | OperationState | GoalState | LoopState;
    }>;
  }): Promise<{ created: number; reused: number; states: number }> => {
    const response = await fetch(`${API_BASE}/agency-model-changes`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(change),
    });
    return await handleResponse(response);
  },
  observations: async (): Promise<AgencyObservations> => {
    const response = await fetch(`${API_BASE}/agency-observations`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return await handleResponse<AgencyObservations>(response);
  },
};
