/**
 * @fileType hook
 * @domain kody
 * @pattern company-intents
 * @ai-summary React Query hooks for company intents and executive management reviews.
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
import { agencyModelApi } from "../api/agency-model";
import {
  intentDefinitionFromInput,
  intentLifecycle,
  projectCompanyIntents,
} from "../agency-product-projections";
import type {
  CompanyIntentInput,
  CompanyIntentRecord,
  CompanyIntentStatus,
} from "../company-intents";

export const companyIntentQueryKeys = {
  list: (owner: string, repo: string) =>
    ["agency-product", owner, repo, "intents"] as const,
};

function queryKey() {
  const auth = getStoredAuth();
  return companyIntentQueryKeys.list(auth?.owner ?? "", auth?.repo ?? "");
}

async function listIntentsFromAgencyModel(): Promise<CompanyIntentRecord[]> {
  const [definitions, states, observations] = await Promise.all([
    agencyModelApi.definitions(),
    agencyModelApi.states(),
    agencyModelApi.observations(),
  ]);
  return projectCompanyIntents(definitions, states, observations);
}

function intentInputFromRecord(
  record: CompanyIntentRecord,
): CompanyIntentInput & { id: string } {
  const intent = record.intent;
  return {
    id: intent.id,
    for: intent.for,
    ...(intent.description ? { description: intent.description } : {}),
    priority: intent.priority,
    posture: intent.posture,
    scope: intent.scope,
    principles: intent.principles,
    metrics: intent.metrics,
    policyRefs: intent.policyRefs,
    controls: intent.controls,
    portfolio: intent.portfolio,
    status: intent.status,
  };
}

async function saveIntent(
  input: CompanyIntentInput & { id: string },
): Promise<CompanyIntentRecord> {
  const definition = intentDefinitionFromInput(input);
  const updatedAt = new Date().toISOString();
  const states =
    input.status === "archived"
      ? [
          {
            kind: "intent" as const,
            state: {
              definitionId: definition.id,
              lifecycle: "retired" as const,
              updatedAt,
            },
          },
          {
            kind: "intent" as const,
            state: {
              definitionId: definition.id,
              lifecycle: "archived" as const,
              updatedAt: new Date(Date.parse(updatedAt) + 1).toISOString(),
            },
          },
        ]
      : [
          {
            kind: "intent" as const,
            state: {
              definitionId: definition.id,
              lifecycle: intentLifecycle(input.status),
              updatedAt,
            },
          },
        ];
  await agencyModelApi.applyChange({
    definitions: [{ kind: "intent", definition }],
    states,
  });
  const records = await listIntentsFromAgencyModel();
  const record = records.find((candidate) => candidate.id === definition.id);
  if (!record) throw new Error("Saved Intent could not be read");
  return record;
}

function mergeIntentRecord(
  records: CompanyIntentRecord[] | undefined,
  next: CompanyIntentRecord,
): CompanyIntentRecord[] {
  if (!records) return [next];
  const found = records.some((record) => record.id === next.id);
  const merged = found
    ? records.map((record) => (record.id === next.id ? next : record))
    : [...records, next];
  return merged.sort(
    (a, b) => a.intent.priority - b.intent.priority || a.id.localeCompare(b.id),
  );
}

export function useCompanyIntents() {
  return useQuery({
    queryKey: queryKey(),
    queryFn: listIntentsFromAgencyModel,
    enabled: Boolean(getStoredAuth()),
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) => {
      if (
        error instanceof NoTokenError ||
        error instanceof SessionExpiredError
      ) {
        return false;
      }
      return failureCount < 2;
    },
  });
}

export function useCreateCompanyIntent() {
  const queryClient = useQueryClient();
  return useMutation<CompanyIntentRecord, Error, CompanyIntentInput>({
    mutationFn: (data) => {
      if (!data.id) throw new Error("Intent id is required");
      return saveIntent({ ...data, id: data.id });
    },
    onSuccess: (created) => {
      queryClient.setQueryData<CompanyIntentRecord[]>(queryKey(), (prev) =>
        mergeIntentRecord(prev, created),
      );
      queryClient.invalidateQueries({ queryKey: queryKey() });
      toast.success("Intent created");
    },
    onError: (error) => {
      toast.error("Failed to create intent", { description: error.message });
    },
  });
}

export function useUpdateCompanyIntent() {
  const queryClient = useQueryClient();
  return useMutation<
    CompanyIntentRecord,
    Error,
    {
      id: string;
      data: Partial<CompanyIntentInput> & { status?: CompanyIntentStatus };
    }
  >({
    mutationFn: async ({ id, data }) => {
      const current = (await listIntentsFromAgencyModel()).find(
        (record) => record.id === id,
      );
      if (!current) throw new Error("Intent not found");
      return saveIntent({
        ...intentInputFromRecord(current),
        ...data,
        id,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<CompanyIntentRecord[]>(queryKey(), (prev) =>
        mergeIntentRecord(prev, updated),
      );
      queryClient.invalidateQueries({ queryKey: queryKey() });
      toast.success("Intent updated");
    },
    onError: (error) => {
      toast.error("Failed to update intent", { description: error.message });
    },
  });
}

export function useRunCompanyIntent() {
  const queryClient = useQueryClient();
  return useMutation<
    {
      ok: true;
      workflowId: string;
      ref: string;
      action: string;
      intentId: string;
    },
    Error,
    string
  >({
    mutationFn: (id) => kodyApi.companyIntents.run(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey() });
      toast.success("CTO review started");
    },
    onError: (error) => {
      toast.error("Failed to start CTO review", { description: error.message });
    },
  });
}
