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
