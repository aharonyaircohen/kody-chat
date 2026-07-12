"use client";

import { useQuery } from "@tanstack/react-query";
import type { AgencyStateModel } from "@kody-ade/agency/observation-state";
import { kodyApi } from "../api";
import { useAuth } from "../auth-context";

export function useAgencyState(model: AgencyStateModel) {
  const { auth } = useAuth();
  return useQuery({
    queryKey: ["kody-agency-state", auth?.owner, auth?.repo, model],
    queryFn: () => kodyApi.agencyState.list(model),
    enabled: !!auth,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
