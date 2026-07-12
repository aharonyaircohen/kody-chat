import type { AgencyStatePayload } from "@kody-ade/agency/observation-store";
import type { AgencyStateModel } from "@kody-ade/agency/observation-state";
import { API_BASE, buildHeaders, handleResponse } from "./client";

export const agencyStateApi = {
  list: async (model: AgencyStateModel): Promise<AgencyStatePayload> => {
    const params = new URLSearchParams({ model });
    const res = await fetch(`${API_BASE}/agency-state?${params}`, {
      headers: buildHeaders(),
      cache: "no-store",
    });
    return handleResponse(res);
  },
};
