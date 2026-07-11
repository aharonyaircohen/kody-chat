import type {
  CreateWorkflowDefinitionInput,
  UpdateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
} from "../workflow-definitions";
import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Workflow Definitions API ============

export const workflowDefinitionsApi = {
  list: async (): Promise<WorkflowDefinitionRecord[]> => {
    const res = await fetch(`${API_BASE}/company/workflows`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const data = await handleResponse<{
      workflows: WorkflowDefinitionRecord[];
    }>(res);
    return data.workflows;
  },

  get: async (id: string): Promise<WorkflowDefinitionRecord> => {
    const res = await fetch(
      `${API_BASE}/company/workflows/${encodeURIComponent(id)}`,
      {
        headers: buildHeaders(),
        cache: "no-store",
      },
    );
    const data = await handleResponse<{
      workflow: WorkflowDefinitionRecord;
    }>(res);
    return data.workflow;
  },

  create: async (
    data: CreateWorkflowDefinitionInput & { actorLogin?: string },
  ): Promise<WorkflowDefinitionRecord> => {
    const res = await fetch(`${API_BASE}/company/workflows`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{
      workflow: WorkflowDefinitionRecord;
    }>(res);
    return payload.workflow;
  },

  update: async (
    id: string,
    data: UpdateWorkflowDefinitionInput & { actorLogin?: string },
  ): Promise<WorkflowDefinitionRecord> => {
    const res = await fetch(
      `${API_BASE}/company/workflows/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      },
    );
    const payload = await handleResponse<{
      workflow: WorkflowDefinitionRecord;
    }>(res);
    return payload.workflow;
  },

  remove: async (id: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/company/workflows/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse<{ success: boolean }>(res);
  },

  run: async (
    id: string,
  ): Promise<{
    ok: boolean;
    workflowId: string;
    ref: string;
    workflow: string;
    action: string;
  }> => {
    const res = await fetch(
      `${API_BASE}/company/workflows/${encodeURIComponent(id)}/run`,
      {
        method: "POST",
        headers: buildHeaders(),
      },
    );
    return handleResponse(res);
  },
};
