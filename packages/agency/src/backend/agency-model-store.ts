import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export const AGENCY_DEFINITION_KINDS = [
  "intent",
  "operation",
  "goal",
  "loop",
  "workflow",
  "capability",
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
