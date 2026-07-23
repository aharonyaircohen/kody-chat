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
import {
  slugifyOperationId,
  type OperationStatus,
} from "@kody-ade/agency/operations";
import type {
  GoalDefinition,
  Lifecycle,
  LoopDefinition,
  OperationDefinition,
  OperationState,
} from "@kody-ade/agency-domain";
import { agencyModelApi } from "../api/agency-model";
import {
  operationDefinitionFromInput,
  projectOperations,
} from "../agency-product-projections";

export const operationQueryKeys = {
  list: (owner: string, repo: string) =>
    ["agency-product", owner, repo, "operations"] as const,
};

function queryKey() {
  const auth = getStoredAuth();
  return operationQueryKeys.list(auth?.owner ?? "", auth?.repo ?? "");
}

async function loadOperations(): Promise<OperationsResponse> {
  const [definitions, states] = await Promise.all([
    agencyModelApi.definitions(),
    agencyModelApi.states(),
  ]);
  return {
    operations: projectOperations(definitions, states),
    catalog: {
      intents: definitions
        .filter((record) => record.kind === "intent")
        .map((record) => record.data.id)
        .sort(),
      goals: definitions
        .filter((record) => record.kind === "goal")
        .map((record) => record.data.id)
        .sort(),
      loops: definitions
        .filter((record) => record.kind === "loop")
        .map((record) => record.data.id)
        .sort(),
    },
  };
}

function operationLifecycle(status: OperationStatus | undefined): Lifecycle {
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "retired") return "retired";
  return "draft";
}

async function ownedWorkRevisions(
  operationId: string,
  goalIds: string[],
  loopIds: string[],
) {
  const definitions = await agencyModelApi.definitions();
  const revisions: Array<{
    kind: "goal" | "loop";
    definition: GoalDefinition | LoopDefinition;
  }> = [];
  for (const record of definitions) {
    if (
      record.kind === "goal" &&
      goalIds.includes(record.data.id) &&
      (record.data as GoalDefinition).operationId !== operationId
    ) {
      revisions.push({
        kind: "goal",
        definition: {
          ...(record.data as GoalDefinition),
          operationId,
        },
      });
    }
    if (
      record.kind === "loop" &&
      loopIds.includes(record.data.id) &&
      (record.data as LoopDefinition).operationId !== operationId
    ) {
      revisions.push({
        kind: "loop",
        definition: {
          ...(record.data as LoopDefinition),
          operationId,
        },
      });
    }
  }
  return revisions;
}

async function saveOperation(
  input: OperationCreateInput & { id: string; status?: OperationStatus },
): Promise<OperationRecord> {
  const definition = operationDefinitionFromInput(input);
  const ownership = await ownedWorkRevisions(
    definition.id,
    input.goals,
    input.loops,
  );
  const updatedAt = new Date().toISOString();
  await agencyModelApi.applyChange({
    definitions: [{ kind: "operation", definition }, ...ownership],
    states: [
      {
        kind: "operation",
        state: {
          definitionId: definition.id,
          lifecycle: operationLifecycle(input.status),
          updatedAt,
        },
      },
    ],
  });
  const result = await loadOperations();
  const record = result.operations.find(
    (candidate) => candidate.id === definition.id,
  );
  if (!record) throw new Error("Saved Operation could not be read");
  return record;
}

export function useOperations() {
  return useQuery({
    queryKey: queryKey(),
    queryFn: loadOperations,
    enabled: Boolean(getStoredAuth()),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: (count, error) =>
      !(
        error instanceof NoTokenError || error instanceof SessionExpiredError
      ) && count < 2,
  });
}

function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: queryKey() });
}

export function useCreateOperation() {
  const queryClient = useQueryClient();
  return useMutation<OperationRecord, Error, OperationCreateInput>({
    mutationFn: (input) => {
      const id = input.id?.trim() || slugifyOperationId(input.name);
      if (!id) throw new Error("Operation id is required");
      return saveOperation({ ...input, id, status: "proposed" });
    },
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
    mutationFn: async ({ id, data }) => {
      const current = (await loadOperations()).operations.find(
        (record) => record.id === id,
      );
      if (!current) throw new Error("Operation not found");
      const nextGoals = data.goals ?? current.operation.goals;
      const nextLoops = data.loops ?? current.operation.loops;
      const removed = [
        ...current.operation.goals
          .filter((goalId) => !nextGoals.includes(goalId))
          .map((goalId) => `Goal "${goalId}"`),
        ...current.operation.loops
          .filter((loopId) => !nextLoops.includes(loopId))
          .map((loopId) => `Loop "${loopId}"`),
      ];
      if (removed.length > 0) {
        throw new Error(
          `Reassign ${removed.join(", ")} before removing ownership`,
        );
      }
      return saveOperation({
        id,
        name: data.name ?? current.operation.name,
        responsibility: data.responsibility ?? current.operation.responsibility,
        doesNotOwn: data.doesNotOwn ?? current.operation.doesNotOwn,
        intentIds: data.intentIds ?? current.operation.intentIds,
        goals: nextGoals,
        loops: nextLoops,
        status: data.status ?? current.operation.status,
      });
    },
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
    mutationFn: async (id) => {
      const states = await agencyModelApi.states();
      const current = states.find(
        (record) => record.kind === "operation" && record.definitionId === id,
      )?.data as OperationState | undefined;
      const updatedAt = new Date().toISOString();
      await agencyModelApi.applyChange({
        definitions: [],
        states: [
          ...(current?.lifecycle === "retired"
            ? []
            : [
                {
                  kind: "operation" as const,
                  state: {
                    definitionId: id,
                    lifecycle: "retired" as const,
                    updatedAt,
                  },
                },
              ]),
          {
            kind: "operation",
            state: {
              definitionId: id,
              lifecycle: "archived",
              updatedAt: new Date(Date.parse(updatedAt) + 1).toISOString(),
            },
          },
        ],
      });
    },
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
