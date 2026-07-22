"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStoredAuth, NoTokenError, SessionExpiredError } from "../api";
import {
  agencyModelApi,
  type AgencyStateRecord,
} from "../api/agency-model";

export const agencyModelQueryKeys = {
  definitions: ["agency-model-v2", "definitions"] as const,
  states: ["agency-model-v2", "states"] as const,
};

const retry = (count: number, error: Error) =>
  !(error instanceof NoTokenError || error instanceof SessionExpiredError) &&
  count < 2;

export function useAgencyDefinitions() {
  return useQuery({
    queryKey: agencyModelQueryKeys.definitions,
    queryFn: agencyModelApi.definitions,
    enabled: Boolean(getStoredAuth()),
    staleTime: 30_000,
    retry,
  });
}

export function useAgencyStates() {
  return useQuery({
    queryKey: agencyModelQueryKeys.states,
    queryFn: agencyModelApi.states,
    enabled: Boolean(getStoredAuth()),
    staleTime: 10_000,
    retry,
  });
}

export function usePutAgencyState() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { kind: "goal" | "loop"; state: AgencyStateRecord["data"] }
  >({
    mutationFn: ({ kind, state }) => agencyModelApi.putState(kind, state),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agencyModelQueryKeys.states });
      toast.success("Agency state updated");
    },
    onError: (error) =>
      toast.error("Failed to update agency state", {
        description: error.message,
      }),
  });
}
