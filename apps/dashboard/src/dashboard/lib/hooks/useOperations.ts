/** @fileType hook @domain agency-operations @pattern operations-hooks */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { getStoredAuth, NoTokenError, SessionExpiredError } from "../api";
import {
  operationsApi,
  type OperationCreateInput,
  type OperationRecord,
  type OperationsResponse,
} from "../api/operations";
import type { OperationStatus } from "@kody-ade/agency/operations";

export const operationQueryKeys = { list: ["kody-operations"] as const };

export function useOperations() {
  return useQuery({
    queryKey: operationQueryKeys.list,
    queryFn: operationsApi.list,
    enabled: Boolean(getStoredAuth()),
    staleTime: 30_000,
    retry: (count, error) =>
      !(
        error instanceof NoTokenError || error instanceof SessionExpiredError
      ) && count < 2,
  });
}

function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: operationQueryKeys.list });
}

export function useCreateOperation() {
  const queryClient = useQueryClient();
  return useMutation<OperationRecord, Error, OperationCreateInput>({
    mutationFn: operationsApi.create,
    onSuccess: () => {
      void refresh(queryClient);
      toast.success("Operation created");
    },
    onError: (error) =>
      toast.error("Failed to create Operation", { description: error.message }),
  });
}

export function useUpdateOperation() {
  const queryClient = useQueryClient();
  return useMutation<
    OperationRecord,
    Error,
    {
      id: string;
      data: Partial<OperationCreateInput> & { status?: OperationStatus };
    }
  >({
    mutationFn: ({ id, data }) => operationsApi.update(id, data),
    onSuccess: () => {
      void refresh(queryClient);
      toast.success("Operation updated");
    },
    onError: (error) =>
      toast.error("Failed to update Operation", { description: error.message }),
  });
}

export function useDeleteOperation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: operationsApi.delete,
    onSuccess: () => {
      void refresh(queryClient);
      toast.success("Operation deleted");
    },
    onError: (error) =>
      toast.error("Failed to delete Operation", { description: error.message }),
  });
}

export function useRunOperation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: operationsApi.run,
    onSuccess: () => {
      void refresh(queryClient);
      toast.success("Operation run started");
    },
    onError: (error) =>
      toast.error("Failed to run Operation", { description: error.message }),
  });
}

export type { OperationsResponse };
