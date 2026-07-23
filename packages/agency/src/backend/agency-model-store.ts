import { createHash } from "node:crypto";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export const AGENCY_DEFINITION_KINDS = [
  "intent",
  "operation",
  "goal",
  "loop",
  "workflow",
  "capability",
  "implementation",
  "agent",
] as const;
export type AgencyDefinitionKind = (typeof AGENCY_DEFINITION_KINDS)[number];

export type StoredAgencyDefinition = {
  recordId: string;
  kind: AgencyDefinitionKind;
  schemaVersion: number;
  data: { id: string };
  createdAt: string;
};

export type StoredAgencyState = {
  definitionId: string;
  kind: "intent" | "operation" | "goal" | "loop";
  schemaVersion: number;
  data: { definitionId: string; lifecycle?: unknown };
  updatedAt: string;
};

export type StoredAgencyModelChange = {
  definitions: Array<{
    recordId: string;
    kind: AgencyDefinitionKind;
    schemaVersion: number;
    data: { id: string };
    createdAt: string;
  }>;
  states: Array<{
    definitionId: string;
    kind: StoredAgencyState["kind"];
    schemaVersion: number;
    data: { definitionId: string; lifecycle?: unknown };
    updatedAt: string;
  }>;
};

export type StoredAgencyOutput = {
  recordId: string;
  runId: string;
  schemaVersion: number;
  data: unknown;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function agencyDefinitionRecordId(
  kind: AgencyDefinitionKind,
  definition: { id: string },
): string {
  const hash = createHash("sha256").update(canonical(definition)).digest("hex");
  return `${kind}:${definition.id}:${hash}`;
}

function tenantIdFor(owner: string, repo: string): string {
  const tenantId = `${owner.trim()}/${repo.trim()}`;
  if (!/^[^/\s]+\/[^/\s]+$/.test(tenantId)) {
    throw new Error("Invalid tenant repository");
  }
  return tenantId;
}

export async function listStoredAgencyDefinitions(
  owner: string,
  repo: string,
): Promise<StoredAgencyDefinition[]> {
  return (await createBackendClient().query(
    backendApi.agencyModel.listDefinitions,
    {
      tenantId: tenantIdFor(owner, repo),
    },
  )) as StoredAgencyDefinition[];
}

export async function createStoredAgencyDefinition(input: {
  owner: string;
  repo: string;
  recordId: string;
  kind: AgencyDefinitionKind;
  data: unknown;
  createdAt: string;
}): Promise<void> {
  await createBackendClient().mutation(
    backendApi.agencyModel.createDefinition,
    {
      tenantId: tenantIdFor(input.owner, input.repo),
      envelope: {
        schemaVersion: 1,
        recordId: input.recordId,
        kind: input.kind,
        data: input.data,
      },
      createdAt: input.createdAt,
    },
  );
}

export async function listStoredAgencyStates(
  owner: string,
  repo: string,
): Promise<StoredAgencyState[]> {
  return (await createBackendClient().query(backendApi.agencyModel.listStates, {
    tenantId: tenantIdFor(owner, repo),
  })) as StoredAgencyState[];
}

export async function putStoredAgencyState(input: {
  owner: string;
  repo: string;
  kind: "intent" | "operation" | "goal" | "loop";
  data: { definitionId: string };
  updatedAt: string;
}): Promise<void> {
  await createBackendClient().mutation(backendApi.agencyModel.putState, {
    tenantId: tenantIdFor(input.owner, input.repo),
    definitionId: input.data.definitionId,
    kind: input.kind,
    schemaVersion: 1,
    data: input.data,
    updatedAt: input.updatedAt,
  });
}

export async function applyStoredAgencyModelChange(input: {
  owner: string;
  repo: string;
  change: StoredAgencyModelChange;
}): Promise<{ created: number; reused: number; states: number }> {
  return (await createBackendClient().mutation(
    backendApi.agencyModel.applyChange,
    {
      tenantId: tenantIdFor(input.owner, input.repo),
      definitions: input.change.definitions,
      states: input.change.states,
    },
  )) as { created: number; reused: number; states: number };
}

export async function listStoredAgencyOutputs(
  owner: string,
  repo: string,
  limit = 500,
): Promise<StoredAgencyOutput[]> {
  return (await createBackendClient().query(
    backendApi.agencyModel.listOutputs,
    {
      tenantId: tenantIdFor(owner, repo),
      limit,
    },
  )) as StoredAgencyOutput[];
}
