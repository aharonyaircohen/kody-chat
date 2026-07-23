/**
 * @fileType hook
 * @domain kody
 * @pattern managed-goals
 * @ai-summary React Query hooks for engine managed goals.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { kodyApi, NoTokenError, SessionExpiredError } from "../api";
import {
  DEFAULT_KODY_STORE_REF,
  DEFAULT_KODY_STORE_REPO_URL,
  useAuth,
  type KodyAuth,
} from "../auth-context";
import type {
  CreateManagedGoalInput,
  ManagedGoalRecord,
  ManagedGoalRouteStep,
  UpdateManagedGoalInput,
} from "../managed-goals";
import { managedGoalModel, slugifyManagedGoalId } from "../managed-goals";
import {
  createGoalDefinition,
  createGoalState,
  createLoopDefinition,
  createLoopState,
  createWorkflowDefinition,
  type GoalDefinition,
  type GoalState,
  type LoopDefinition,
  type LoopState,
  type WorkflowDefinition,
} from "@kody-ade/agency-domain";
import { agencyModelApi } from "../api/agency-model";
import { projectManagedGoals } from "../agency-product-projections";

export const managedGoalQueryKeys = {
  all: ["kody-managed-goals"] as const,
  list: (scope: ManagedGoalQueryScope | null) =>
    [...managedGoalQueryKeys.all, scope ?? "no-auth"] as const,
  runHistory: (scope: ManagedGoalQueryScope | null, id: string) =>
    [
      ...managedGoalQueryKeys.all,
      "run-history",
      scope ?? "no-auth",
      id,
    ] as const,
};

type ManagedGoalQueryScope = {
  owner: string;
  repo: string;
  storeRepoUrl: string;
  storeRef: string;
};

function managedGoalQueryScope(
  auth: KodyAuth | null,
): ManagedGoalQueryScope | null {
  if (!auth) return null;
  return {
    owner: auth.owner,
    repo: auth.repo,
    storeRepoUrl: auth.storeRepoUrl ?? DEFAULT_KODY_STORE_REPO_URL,
    storeRef: auth.storeRef ?? DEFAULT_KODY_STORE_REF,
  };
}

function useManagedGoalQueryKey() {
  const { auth } = useAuth();
  return {
    auth,
    queryKey: managedGoalQueryKeys.list(managedGoalQueryScope(auth)),
  };
}

type ManagedGoalStateMutationInput = {
  id: string;
  state: "inactive" | "active" | "paused";
  pausedReason?: string;
};

type ManagedGoalStateMutationContext = {
  previous: ManagedGoalRecord[];
};

type ManagedGoalDeleteMutationContext = {
  previous: ManagedGoalRecord[];
};

function managedGoalMatchesId(goal: ManagedGoalRecord, id: string): boolean {
  const sourceTemplate =
    typeof goal.state.sourceTemplate === "string"
      ? goal.state.sourceTemplate
      : "";
  return goal.id === id || sourceTemplate === id;
}

function patchManagedGoalState(
  goals: ManagedGoalRecord[] | undefined,
  id: string,
  state: "inactive" | "active" | "paused",
  pausedReason?: string,
): ManagedGoalRecord[] | undefined {
  if (!goals) return goals;
  return goals.map((goal) => {
    if (!managedGoalMatchesId(goal, id)) return goal;
    return {
      ...goal,
      state: {
        ...goal.state,
        state,
        ...(state === "paused" && pausedReason ? { pausedReason } : {}),
        ...(state !== "paused" ? { pausedReason: undefined } : {}),
      },
    };
  });
}

function mergeManagedGoalRecord(
  goals: ManagedGoalRecord[] | undefined,
  updated: ManagedGoalRecord,
): ManagedGoalRecord[] {
  if (!goals) return [updated];
  let matched = false;
  const next = goals.map((goal) => {
    if (!managedGoalMatchesId(goal, updated.id)) return goal;
    matched = true;
    return {
      ...goal,
      ...updated,
      id: goal.id,
      state: {
        ...goal.state,
        ...updated.state,
      },
    };
  });
  return matched
    ? next
    : [...goals, updated].sort((a, b) => a.id.localeCompare(b.id));
}

async function loadManagedGoalsFromAgencyModel(): Promise<ManagedGoalRecord[]> {
  const [definitions, states, observations] = await Promise.all([
    agencyModelApi.definitions(),
    agencyModelApi.states(),
    agencyModelApi.observations(),
  ]);
  return projectManagedGoals(definitions, states, observations);
}

function workflowFromInput(
  id: string,
  input: Pick<CreateManagedGoalInput, "route" | "capabilities">,
): WorkflowDefinition | undefined {
  const route: ManagedGoalRouteStep[] =
    input.route && input.route.length > 0
      ? input.route
      : (input.capabilities ?? []).length > 1
        ? (input.capabilities ?? []).map((capability, index) => ({
            stage: `step-${index + 1}`,
            evidence: `step-${index + 1}`,
            capability,
          }))
        : [];
  if (route.length === 0) return undefined;
  return createWorkflowDefinition({
    id: `${id}-workflow`,
    steps: route.map((step, index) => ({
      id: step.stage,
      capabilityRef: { kind: "capability", id: step.capability },
      dependsOn: index === 0 ? [] : [route[index - 1]!.stage],
      ...(step.args ? { input: step.args } : {}),
    })),
  });
}

function lifecycleForManagedState(
  state: ManagedGoalStateMutationInput["state"] | undefined,
) {
  return state === "active" ? "active" : "paused";
}

async function saveNewManagedGoal(
  input: CreateManagedGoalInput,
): Promise<ManagedGoalRecord> {
  const id = input.id?.trim() || slugifyManagedGoalId(input.outcome);
  if (!id) throw new Error("Goal or Loop id is required");
  if (!input.operationId) {
    throw new Error("Select the Operation that owns this Goal or Loop");
  }
  const isLoop = input.type === "agentLoop";
  const workflow = workflowFromInput(id, input);
  const definitions: Parameters<
    typeof agencyModelApi.applyChange
  >[0]["definitions"] = workflow
    ? [{ kind: "workflow", definition: workflow }]
    : [];
  const states: Parameters<typeof agencyModelApi.applyChange>[0]["states"] = [];
  const now = new Date().toISOString();
  if (isLoop) {
    const targetRef =
      input.loopTarget ??
      (workflow
        ? { type: "workflow" as const, id: workflow.id }
        : (input.capabilities ?? []).length === 1
          ? {
              type: "capability" as const,
              id: input.capabilities![0]!,
            }
          : undefined);
    if (!targetRef) throw new Error("Loop target is required");
    const definition = createLoopDefinition({
      id,
      operationId: input.operationId,
      objective: {
        desiredState: input.outcome,
        requiredEvidence: input.evidence ?? [],
        scope: { include: {}, exclude: {} },
      },
      trigger:
        !input.schedule || input.schedule === "manual"
          ? { type: "manual" }
          : {
              type: "schedule",
              every: input.schedule,
              ...(input.preferredRunTime ? { at: input.preferredRunTime } : {}),
            },
      targetRef: { kind: targetRef.type, id: targetRef.id },
      reconciliationPolicy: {
        overlap: "skip",
        missed: "coalesce",
        failure: {
          maxAttempts: 3,
          backoffSeconds: 30,
          timeoutSeconds: 900,
        },
      },
    });
    definitions.push({ kind: "loop", definition });
    states.push({
      kind: "loop",
      state: createLoopState({
        definitionId: id,
        lifecycle: "active",
        health: "unknown",
        failures: 0,
        updatedAt: now,
      }),
    });
  } else {
    const executionRef = input.workflowRef
      ? { kind: "workflow" as const, id: input.workflowRef.id }
      : workflow
        ? { kind: "workflow" as const, id: workflow.id }
        : (input.capabilities ?? []).length === 1
          ? {
              kind: "capability" as const,
              id: input.capabilities![0]!,
            }
          : undefined;
    if (!executionRef) {
      throw new Error("Goal Workflow or Capability is required");
    }
    const definition = createGoalDefinition({
      id,
      operationId: input.operationId,
      objective: {
        desiredState: input.outcome,
        requiredEvidence: input.evidence ?? [],
        scope: { include: {}, exclude: {} },
      },
      executionRef,
    });
    definitions.push({ kind: "goal", definition });
    states.push({
      kind: "goal",
      state: createGoalState({
        definitionId: id,
        lifecycle: "active",
        progress: 0,
        blockers: [],
        updatedAt: now,
      }),
    });
  }
  await agencyModelApi.applyChange({ definitions, states });
  const created = (await loadManagedGoalsFromAgencyModel()).find(
    (record) => record.id === id,
  );
  if (!created) throw new Error("Saved Goal or Loop could not be read");
  return created;
}

async function updateManagedGoal(
  id: string,
  input: UpdateManagedGoalInput,
): Promise<ManagedGoalRecord> {
  const [definitions, states, projected] = await Promise.all([
    agencyModelApi.definitions(),
    agencyModelApi.states(),
    loadManagedGoalsFromAgencyModel(),
  ]);
  const current = projected.find((record) => record.id === id);
  if (!current) throw new Error("Goal or Loop not found");
  const isLoop = managedGoalModel(current) === "agentLoop";
  const now = new Date().toISOString();
  if (isLoop) {
    const definitionRecord = definitions.find(
      (record) => record.kind === "loop" && record.data.id === id,
    );
    if (!definitionRecord) throw new Error("Loop definition not found");
    const previous = definitionRecord.data as LoopDefinition;
    const workflow = workflowFromInput(id, {
      route: input.route,
      capabilities: input.capabilities,
    });
    const targetRef = input.loopTarget
      ? { kind: input.loopTarget.type, id: input.loopTarget.id }
      : workflow
        ? { kind: "workflow" as const, id: workflow.id }
        : previous.targetRef;
    const nextDefinition = createLoopDefinition({
      ...previous,
      objective: {
        ...previous.objective,
        desiredState: input.outcome ?? previous.objective.desiredState,
        requiredEvidence: input.evidence ?? previous.objective.requiredEvidence,
      },
      trigger:
        input.schedule === undefined
          ? previous.trigger
          : input.schedule === "manual"
            ? { type: "manual" }
            : {
                type: "schedule",
                every: input.schedule,
                ...(input.preferredRunTime
                  ? { at: input.preferredRunTime }
                  : {}),
              },
      targetRef,
    });
    const previousState = states.find(
      (record) => record.kind === "loop" && record.definitionId === id,
    )?.data as LoopState | undefined;
    const nextState = createLoopState({
      definitionId: id,
      lifecycle:
        input.state === undefined
          ? (previousState?.lifecycle ?? "draft")
          : lifecycleForManagedState(input.state),
      health: previousState?.health ?? "unknown",
      failures: previousState?.failures ?? 0,
      ...(previousState?.lastFiredAt
        ? { lastFiredAt: previousState.lastFiredAt }
        : {}),
      ...(previousState?.nextEligibleAt
        ? { nextEligibleAt: previousState.nextEligibleAt }
        : {}),
      updatedAt: now,
    });
    await agencyModelApi.applyChange({
      definitions: [
        ...(workflow
          ? [{ kind: "workflow" as const, definition: workflow }]
          : []),
        { kind: "loop", definition: nextDefinition },
      ],
      states: [{ kind: "loop", state: nextState }],
    });
  } else {
    const definitionRecord = definitions.find(
      (record) => record.kind === "goal" && record.data.id === id,
    );
    if (!definitionRecord) throw new Error("Goal definition not found");
    const previous = definitionRecord.data as GoalDefinition;
    const workflow = workflowFromInput(id, {
      route: input.route,
      capabilities: input.capabilities,
    });
    const executionRef = input.workflowRef
      ? { kind: "workflow" as const, id: input.workflowRef.id }
      : workflow
        ? { kind: "workflow" as const, id: workflow.id }
        : previous.executionRef;
    const nextDefinition = createGoalDefinition({
      ...previous,
      objective: {
        ...previous.objective,
        desiredState: input.outcome ?? previous.objective.desiredState,
        requiredEvidence: input.evidence ?? previous.objective.requiredEvidence,
      },
      executionRef,
    });
    const previousState = states.find(
      (record) => record.kind === "goal" && record.definitionId === id,
    )?.data as GoalState | undefined;
    const nextState = createGoalState({
      definitionId: id,
      lifecycle:
        input.state === undefined
          ? (previousState?.lifecycle ?? "draft")
          : lifecycleForManagedState(input.state),
      progress: previousState?.progress ?? 0,
      blockers:
        input.state === "paused" && input.pausedReason
          ? [input.pausedReason]
          : (previousState?.blockers ?? []),
      updatedAt: now,
    });
    await agencyModelApi.applyChange({
      definitions: [
        ...(workflow
          ? [{ kind: "workflow" as const, definition: workflow }]
          : []),
        { kind: "goal", definition: nextDefinition },
      ],
      states: [{ kind: "goal", state: nextState }],
    });
  }
  const updated = (await loadManagedGoalsFromAgencyModel()).find(
    (record) => record.id === id,
  );
  if (!updated) throw new Error("Updated Goal or Loop could not be read");
  return updated;
}

export function useManagedGoals() {
  const { auth, queryKey } = useManagedGoalQueryKey();
  return useQuery({
    queryKey,
    queryFn: loadManagedGoalsFromAgencyModel,
    enabled: !!auth,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (error instanceof SessionExpiredError) return false;
      if (error instanceof NoTokenError) return false;
      return failureCount < 2;
    },
  });
}

export function useManagedGoalRunHistory(id: string, enabled = true) {
  const { auth } = useAuth();
  return useQuery({
    queryKey: managedGoalQueryKeys.runHistory(managedGoalQueryScope(auth), id),
    queryFn: () => kodyApi.goals.runHistory(id),
    enabled: !!auth && enabled && !!id,
    staleTime: 60_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useCreateManagedGoal() {
  const queryClient = useQueryClient();
  const { queryKey } = useManagedGoalQueryKey();
  return useMutation<ManagedGoalRecord, Error, CreateManagedGoalInput>({
    mutationFn: saveNewManagedGoal,
    onSuccess: (created) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(queryKey, (prev) => {
        if (!prev) return [created];
        if (prev.some((goal) => goal.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.id.localeCompare(b.id));
      });
      queryClient.invalidateQueries({ queryKey });
      toast.success("Created");
    },
    onError: (error) => {
      toast.error("Failed to create item", { description: error.message });
    },
  });
}

export function useUpdateManagedGoal(id: string) {
  const queryClient = useQueryClient();
  const { queryKey } = useManagedGoalQueryKey();
  return useMutation<ManagedGoalRecord, Error, UpdateManagedGoalInput>({
    mutationFn: (data) => updateManagedGoal(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(queryKey, (prev) =>
        prev
          ? prev.map((goal) => (goal.id === updated.id ? updated : goal))
          : [updated],
      );
      queryClient.invalidateQueries({ queryKey });
      toast.success("Updated");
    },
    onError: (error) => {
      toast.error("Failed to update item", { description: error.message });
    },
  });
}

export function useDeleteManagedGoal() {
  const queryClient = useQueryClient();
  const { queryKey } = useManagedGoalQueryKey();
  return useMutation<void, Error, string, ManagedGoalDeleteMutationContext>({
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<ManagedGoalRecord[]>(queryKey) ?? [];
      queryClient.setQueryData<ManagedGoalRecord[]>(
        queryKey,
        (prev) => prev?.filter((goal) => !managedGoalMatchesId(goal, id)) ?? [],
      );
      return { previous };
    },
    mutationFn: async (id) => {
      const [definitions, states] = await Promise.all([
        agencyModelApi.definitions(),
        agencyModelApi.states(),
      ]);
      const kind = definitions.some(
        (record) => record.kind === "loop" && record.data.id === id,
      )
        ? "loop"
        : "goal";
      const current = states.find(
        (record) => record.kind === kind && record.definitionId === id,
      )?.data as GoalState | LoopState | undefined;
      const now = new Date().toISOString();
      if (kind === "loop") {
        const loop = current as LoopState | undefined;
        await agencyModelApi.applyChange({
          definitions: [],
          states: [
            ...(loop?.lifecycle === "retired"
              ? []
              : [
                  {
                    kind: "loop" as const,
                    state: createLoopState({
                      definitionId: id,
                      lifecycle: "retired",
                      health: loop?.health ?? "unknown",
                      failures: loop?.failures ?? 0,
                      updatedAt: now,
                    }),
                  },
                ]),
            {
              kind: "loop",
              state: createLoopState({
                definitionId: id,
                lifecycle: "archived",
                health: loop?.health ?? "unknown",
                failures: loop?.failures ?? 0,
                updatedAt: new Date(Date.parse(now) + 1).toISOString(),
              }),
            },
          ],
        });
      } else {
        const goal = current as GoalState | undefined;
        await agencyModelApi.applyChange({
          definitions: [],
          states: [
            ...(goal?.lifecycle === "retired"
              ? []
              : [
                  {
                    kind: "goal" as const,
                    state: createGoalState({
                      definitionId: id,
                      lifecycle: "retired",
                      progress: goal?.progress ?? 0,
                      blockers: goal?.blockers ?? [],
                      updatedAt: now,
                    }),
                  },
                ]),
            {
              kind: "goal",
              state: createGoalState({
                definitionId: id,
                lifecycle: "archived",
                progress: goal?.progress ?? 0,
                blockers: goal?.blockers ?? [],
                updatedAt: new Date(Date.parse(now) + 1).toISOString(),
              }),
            },
          ],
        });
      }
    },
    onSuccess: (_unused, id) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(
        queryKey,
        (prev) => prev?.filter((goal) => !managedGoalMatchesId(goal, id)) ?? [],
      );
      toast.success("Deleted");
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ManagedGoalRecord[]>(
          queryKey,
          context.previous,
        );
      }
      toast.error("Failed to delete item", { description: error.message });
    },
  });
}

export function useRunManagedGoal() {
  const queryClient = useQueryClient();
  const { queryKey } = useManagedGoalQueryKey();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: async (id) => {
      const current = queryClient
        .getQueryData<ManagedGoalRecord[]>(queryKey)
        ?.find((record) => record.id === id);
      if (!current) throw new Error("Goal or Loop not found");
      if (managedGoalModel(current) === "agentLoop") {
        await kodyApi.goals.runLoop(id);
      } else {
        await kodyApi.goals.runManaged(id);
      }
      return { ok: true };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Run started");
    },
    onError: (error) => {
      toast.error("Failed to start run", { description: error.message });
    },
  });
}

export function useSetManagedGoalState() {
  const queryClient = useQueryClient();
  const { queryKey } = useManagedGoalQueryKey();
  return useMutation<
    ManagedGoalRecord,
    Error,
    ManagedGoalStateMutationInput,
    ManagedGoalStateMutationContext
  >({
    onMutate: async ({ id, state, pausedReason }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<ManagedGoalRecord[]>(queryKey) ?? [];
      queryClient.setQueryData<ManagedGoalRecord[]>(queryKey, (prev) =>
        patchManagedGoalState(prev, id, state, pausedReason),
      );
      return { previous };
    },
    mutationFn: ({ id, state, pausedReason }) =>
      updateManagedGoal(id, {
        state,
        ...(pausedReason ? { pausedReason } : {}),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<ManagedGoalRecord[]>(queryKey, (prev) =>
        mergeManagedGoalRecord(prev, updated),
      );
      toast.success(
        updated.state.state === "active"
          ? "Goal activated"
          : "Goal deactivated",
      );
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<ManagedGoalRecord[]>(
          queryKey,
          context.previous,
        );
      }
      toast.error("Failed to update item", { description: error.message });
    },
  });
}
