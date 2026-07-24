import type { ScheduleEvery } from "../ticked/frontmatter";
import { API_BASE, buildHeaders, handleResponse } from "./client";

// ============ Capabilities API ============

export interface CapabilitySummary {
  slug: string;
  describe?: string;
  agent?: string | null;
  every?: ScheduleEvery | string | null;
  source?: "local" | "store";
  readOnly?: boolean;
}

export interface CapabilityContract {
  input: { name: string; schema: Record<string, unknown> };
  output: { name: string; schema: Record<string, unknown> };
}

export interface CapabilityAsset {
  name: string;
  content?: string;
  body?: string;
}

export interface CapabilityDetail extends CapabilitySummary {
  instructions: string;
  simpleContract: CapabilityContract;
  skills: CapabilityAsset[];
  capabilityTools: CapabilityAsset[];
}

export interface CapabilityWriteInput {
  slug?: string;
  instructions: string;
  inputName: string;
  inputSchema: Record<string, unknown>;
  outputName: string;
  outputSchema: Record<string, unknown>;
  skills: Array<{ path: string; content: string }>;
  tools: Array<{ path: string; content: string }>;
}

export const capabilitiesApi = {
  list: async (): Promise<CapabilitySummary[]> => {
    const res = await fetch(`${API_BASE}/capabilities`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    const data = await handleResponse<{
      capabilities: CapabilitySummary[];
    }>(res);
    return data.capabilities;
  },

  get: async (slug: string): Promise<CapabilityDetail> => {
    const res = await fetch(
      `${API_BASE}/capabilities/${encodeURIComponent(slug)}`,
      { headers: buildHeaders(), cache: "no-store" },
    );
    return (await handleResponse<{ capability: CapabilityDetail }>(res))
      .capability;
  },

  create: async (input: CapabilityWriteInput): Promise<CapabilityDetail> => {
    const res = await fetch(`${API_BASE}/capabilities`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(input),
    });
    return (await handleResponse<{ capability: CapabilityDetail }>(res))
      .capability;
  },

  update: async (
    slug: string,
    input: CapabilityWriteInput,
  ): Promise<CapabilityDetail> => {
    const res = await fetch(
      `${API_BASE}/capabilities/${encodeURIComponent(slug)}`,
      {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(input),
      },
    );
    return (await handleResponse<{ capability: CapabilityDetail }>(res))
      .capability;
  },

  remove: async (slug: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/capabilities/${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: buildHeaders() },
    );
    await handleResponse(res);
  },

  run: async (
    capability: { slug: string },
    opts?: { force?: boolean },
  ): Promise<{
    workflowId: string;
    ref: string;
    action: string;
    capability: string;
    force: boolean;
  }> => {
    const res = await fetch(
      `${API_BASE}/capabilities/${encodeURIComponent(capability.slug)}/run`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ force: opts?.force ?? true }),
      },
    );
    return handleResponse(res);
  },
};
