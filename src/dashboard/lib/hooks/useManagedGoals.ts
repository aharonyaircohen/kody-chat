/**
 * @fileType hook
 * @domain kody
 * @pattern managed-goals
 * @ai-summary React Query hooks for engine managed goals.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  kodyApi,
  NoTokenError,
  SessionExpiredError,
  getStoredAuth,
} from "../api";
import type {
  CreateManagedGoalInput,
  ManagedGoalRecord,
} from "../managed-goals";

export const managedGoalQueryKeys = {
  list: ["kody-managed-goals"] as const,
};

export function useManagedGoals() {
  return useQuery({
    queryKey: managedGoalQueryKeys.list,
    queryFn: () => kodyApi.goals.listManaged(),
    enabled: !!getStoredAuth(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof SessionExpiredError) return false;
      if (error instanceof NoTokenError) return false;
      return failureCount < 2;
    },
  });
}

export function useCreateManagedGoal(actorLogin?: string | null) {
  const queryClient = useQueryClient();
  return useMutation<ManagedGoalRecord, Error, CreateManagedGoalInput>({
    mutationFn: (data) =>
      kodyApi.goals.createManaged({
        ...data,
        ...(actorLogin ? { actorLogin } : {}),
      }),
    onSuccess: (created) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(
        managedGoalQueryKeys.list,
        (prev) => {
          if (!prev) return [created];
          if (prev.some((goal) => goal.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => a.id.localeCompare(b.id));
        },
      );
      queryClient.invalidateQueries({ queryKey: managedGoalQueryKeys.list });
      toast.success("Goal created");
    },
    onError: (error) => {
      toast.error("Failed to create goal", { description: error.message });
    },
  });
}
