/**
 * @fileType hook
 * @domain kody
 * @pattern workflow-definitions
 * @ai-summary React Query hooks for company workflow definitions.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getStoredAuth,
  kodyApi,
  NoTokenError,
  SessionExpiredError,
} from "../api";
import type {
  CreateWorkflowDefinitionInput,
  UpdateWorkflowDefinitionInput,
  WorkflowDefinitionRecord,
} from "../workflow-definitions";

export const workflowDefinitionQueryKeys = {
  list: ["kody-workflow-definitions"] as const,
};

type WorkflowDeleteMutationContext = {
  previous: WorkflowDefinitionRecord[];
};

export function useWorkflowDefinitions() {
  return useQuery({
    queryKey: workflowDefinitionQueryKeys.list,
    queryFn: () => kodyApi.workflowDefinitions.list(),
    enabled: !!getStoredAuth(),
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof SessionExpiredError) return false;
      if (error instanceof NoTokenError) return false;
      return failureCount < 2;
    },
  });
}

export function useCreateWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation<
    WorkflowDefinitionRecord,
    Error,
    CreateWorkflowDefinitionInput
  >({
    mutationFn: (data) => kodyApi.workflowDefinitions.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData<WorkflowDefinitionRecord[]>(
        workflowDefinitionQueryKeys.list,
        (prev) => {
          if (!prev) return [created];
          if (prev.some((workflow) => workflow.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => a.id.localeCompare(b.id));
        },
      );
      queryClient.invalidateQueries({
        queryKey: workflowDefinitionQueryKeys.list,
      });
      toast.success("Created");
    },
    onError: (error) => {
      toast.error("Failed to create workflow", {
        description: error.message,
      });
    },
  });
}

export function useUpdateWorkflowDefinition(id: string) {
  const queryClient = useQueryClient();
  return useMutation<
    WorkflowDefinitionRecord,
    Error,
    UpdateWorkflowDefinitionInput
  >({
    mutationFn: (data) => kodyApi.workflowDefinitions.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<WorkflowDefinitionRecord[]>(
        workflowDefinitionQueryKeys.list,
        (prev) =>
          prev
            ? prev.map((workflow) =>
                workflow.id === updated.id ? updated : workflow,
              )
            : [updated],
      );
      queryClient.invalidateQueries({
        queryKey: workflowDefinitionQueryKeys.list,
      });
      toast.success("Updated");
    },
    onError: (error) => {
      toast.error("Failed to update workflow", {
        description: error.message,
      });
    },
  });
}

export function useDeleteWorkflowDefinition() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, WorkflowDeleteMutationContext>({
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: workflowDefinitionQueryKeys.list,
      });
      const previous =
        queryClient.getQueryData<WorkflowDefinitionRecord[]>(
          workflowDefinitionQueryKeys.list,
        ) ?? [];
      queryClient.setQueryData<WorkflowDefinitionRecord[]>(
        workflowDefinitionQueryKeys.list,
        (prev) => prev?.filter((workflow) => workflow.id !== id) ?? [],
      );
      return { previous };
    },
    mutationFn: (id) => kodyApi.workflowDefinitions.remove(id),
    onSuccess: () => {
      toast.success("Deleted");
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData<WorkflowDefinitionRecord[]>(
          workflowDefinitionQueryKeys.list,
          context.previous,
        );
      }
      toast.error("Failed to delete workflow", {
        description: error.message,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: workflowDefinitionQueryKeys.list,
      });
    },
  });
}
