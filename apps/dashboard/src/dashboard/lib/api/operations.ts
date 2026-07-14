import type {
  CreateOperationInput,
  Operation,
  OperationCatalog,
  OperationStatus,
} from "@kody-ade/agency/operations";
import { API_BASE, buildHeaders, handleResponse } from "./client";

export interface OperationRecord {
  id: string;
  path: string;
  operation: Operation;
  activationIssues: string[];
}

export type OperationCreateInput = Omit<
  CreateOperationInput,
  "id" | "status"
> & {
  id?: string;
};

export interface OperationsResponse {
  operations: OperationRecord[];
  catalog: OperationCatalog;
}

export const operationsApi = {
  list: async (): Promise<OperationsResponse> => {
    const response = await fetch(`${API_BASE}/operations`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return handleResponse(response);
  },
  create: async (data: OperationCreateInput): Promise<OperationRecord> => {
    const response = await fetch(`${API_BASE}/operations`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    return (await handleResponse<{ operation: OperationRecord }>(response))
      .operation;
  },
  update: async (
    id: string,
    data: Partial<OperationCreateInput> & { status?: OperationStatus },
  ): Promise<OperationRecord> => {
    const response = await fetch(
      `${API_BASE}/operations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      },
    );
    return (await handleResponse<{ operation: OperationRecord }>(response))
      .operation;
  },
  delete: async (id: string): Promise<void> => {
    const response = await fetch(
      `${API_BASE}/operations/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: buildHeaders(),
      },
    );
    await handleResponse(response);
  },
  run: async (id: string) => {
    const response = await fetch(
      `${API_BASE}/operations/${encodeURIComponent(id)}/run`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({}),
      },
    );
    return handleResponse<{
      ok: true;
      workflowId: string;
      ref: string;
      action: "agency-operations-management";
      operationId: string;
    }>(response);
  },
};
