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
  UpdateManagedGoalInput,
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

export function useCreateManagedGoal() {
  const queryClient = useQueryClient();
  return useMutation<ManagedGoalRecord, Error, CreateManagedGoalInput>({
    mutationFn: (data) => kodyApi.goals.createManaged(data),
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

export function useUpdateManagedGoal(id: string) {
  const queryClient = useQueryClient();
  return useMutation<ManagedGoalRecord, Error, UpdateManagedGoalInput>({
    mutationFn: (data) => kodyApi.goals.updateManaged(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(
        managedGoalQueryKeys.list,
        (prev) =>
          prev
            ? prev.map((goal) => (goal.id === updated.id ? updated : goal))
            : [updated],
      );
      queryClient.invalidateQueries({ queryKey: managedGoalQueryKeys.list });
      toast.success("Goal updated");
    },
    onError: (error) => {
      toast.error("Failed to update goal", { description: error.message });
    },
  });
}

export function useDeleteManagedGoal() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => kodyApi.goals.removeManaged(id),
    onSuccess: (_unused, id) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(
        managedGoalQueryKeys.list,
        (prev) => prev?.filter((goal) => goal.id !== id) ?? [],
      );
      queryClient.invalidateQueries({ queryKey: managedGoalQueryKeys.list });
      toast.success("Goal deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete goal", { description: error.message });
    },
  });
}

export function useSetManagedGoalState() {
  const queryClient = useQueryClient();
  return useMutation<
    ManagedGoalRecord,
    Error,
    {
      id: string;
      state: "inactive" | "active" | "paused";
      pausedReason?: string;
    }
  >({
    mutationFn: ({ id, state, pausedReason }) =>
      kodyApi.goals.updateManaged(id, {
        state,
        ...(pausedReason ? { pausedReason } : {}),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(
        managedGoalQueryKeys.list,
        (prev) =>
          prev
            ? prev.map((goal) => (goal.id === updated.id ? updated : goal))
            : [updated],
      );
      queryClient.invalidateQueries({ queryKey: managedGoalQueryKeys.list });
      toast.success(
        updated.state.state === "active" ? "Goal activated" : "Goal paused",
      );
    },
    onError: (error) => {
      toast.error("Failed to update goal", { description: error.message });
    },
  });
}
