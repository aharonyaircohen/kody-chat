import type {
  CompanyIntentInput,
  CompanyIntentRecord,
  CompanyIntentStatus,
} from "../company-intents";
import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Company Intents API ============

export const companyIntentsApi = {
  list: async (): Promise<CompanyIntentRecord[]> => {
    const res = await fetch(`${API_BASE}/company/intents`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const payload = await handleResponse<{ intents: CompanyIntentRecord[] }>(
      res,
    );
    return payload.intents;
  },
  create: async (
    data: CompanyIntentInput & { actorLogin?: string },
  ): Promise<CompanyIntentRecord> => {
    const res = await fetch(`${API_BASE}/company/intents`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(data),
    });
    const payload = await handleResponse<{ intent: CompanyIntentRecord }>(res);
    return payload.intent;
  },
  update: async (
    id: string,
    data: Partial<CompanyIntentInput> & {
      status?: CompanyIntentStatus;
      actorLogin?: string;
    },
  ): Promise<CompanyIntentRecord> => {
    const res = await fetch(
      `${API_BASE}/company/intents/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      },
    );
    const payload = await handleResponse<{ intent: CompanyIntentRecord }>(res);
    return payload.intent;
  },
  run: async (
    id: string,
    actorLogin?: string,
  ): Promise<{
    ok: true;
    workflowId: string;
    ref: string;
    action: string;
    intentId: string;
  }> => {
    const res = await fetch(
      `${API_BASE}/company/intents/${encodeURIComponent(id)}/run`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ ...(actorLogin ? { actorLogin } : {}) }),
      },
    );
    return handleResponse(res);
  },
};
