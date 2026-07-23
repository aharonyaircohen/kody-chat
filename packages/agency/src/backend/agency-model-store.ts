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
  data: { id: string } & Record<string, unknown>;
  createdAt: string;
};

export type StoredAgencyState = {
  definitionId: string;
  kind: "goal" | "loop";
  schemaVersion: number;
  data: Record<string, unknown>;
  updatedAt: string;
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
  return (await createBackendClient().query(backendApi.agencyModel.listDefinitions, {
    tenantId: tenantIdFor(owner, repo),
  })) as StoredAgencyDefinition[];
}

export async function createStoredAgencyDefinition(input: {
  owner: string;
  repo: string;
  recordId: string;
  kind: AgencyDefinitionKind;
  data: unknown;
  createdAt: string;
}): Promise<void> {
  await createBackendClient().mutation(backendApi.agencyModel.createDefinition, {
    tenantId: tenantIdFor(input.owner, input.repo),
    envelope: {
      schemaVersion: 1,
      recordId: input.recordId,
      kind: input.kind,
      data: input.data,
    },
    createdAt: input.createdAt,
  });
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
  kind: "goal" | "loop";
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
