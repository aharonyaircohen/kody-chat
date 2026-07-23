"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStoredAuth, NoTokenError, SessionExpiredError } from "../api";
import {
  agencyModelApi,
  type AgencyStateRecord,
} from "../api/agency-model";

export const agencyModelQueryKeys = {
  definitions: (owner: string, repo: string) =>
    ["agency-model-v2", owner, repo, "definitions"] as const,
  states: (owner: string, repo: string) =>
    ["agency-model-v2", owner, repo, "states"] as const,
};

const retry = (count: number, error: Error) =>
  !(error instanceof NoTokenError || error instanceof SessionExpiredError) &&
  count < 2;

export function useAgencyDefinitions() {
  const auth = getStoredAuth();
  return useQuery({
    queryKey: agencyModelQueryKeys.definitions(
      auth?.owner ?? "",
      auth?.repo ?? "",
    ),
    queryFn: agencyModelApi.definitions,
    enabled: Boolean(auth),
    staleTime: 30_000,
    retry,
  });
}

export function useAgencyStates() {
  const auth = getStoredAuth();
  return useQuery({
    queryKey: agencyModelQueryKeys.states(auth?.owner ?? "", auth?.repo ?? ""),
    queryFn: agencyModelApi.states,
    enabled: Boolean(auth),
    staleTime: 10_000,
    retry,
  });
}

export function usePutAgencyState() {
  const queryClient = useQueryClient();
  const auth = getStoredAuth();
  return useMutation<
    unknown,
    Error,
    { kind: "goal" | "loop"; state: AgencyStateRecord["data"] }
  >({
    mutationFn: ({ kind, state }) => agencyModelApi.putState(kind, state),
    onSuccess: () => {
      if (auth) {
        void queryClient.invalidateQueries({
          queryKey: agencyModelQueryKeys.states(auth.owner, auth.repo),
        });
      }
      toast.success("Agency state updated");
    },
    onError: (error) =>
      toast.error("Failed to update agency state", {
        description: error.message,
      }),
  });
}
