import type { ImplementationDefinition } from "@kody-ade/agency-domain";

import type { StoredAgencyDefinition } from "./backend/agency-model-store";
import {
  currentAgencyDefinition,
  currentAgencyDefinitions,
} from "./agency-model-read";

export type CapabilityImplementationResolution = {
  status: "resolved" | "ambiguous" | "unavailable";
  capabilityRevision: string | null;
  candidates: StoredAgencyDefinition[];
  selected?: StoredAgencyDefinition;
};

function revisionFromRecordId(recordId: string): string | null {
  const separator = recordId.lastIndexOf(":");
  return separator >= 0 ? recordId.slice(separator + 1) || null : null;
}

export function resolveCapabilityImplementations(
  records: readonly StoredAgencyDefinition[],
  capabilityId: string,
  repositoryBinding?: string,
): CapabilityImplementationResolution {
  const capability = currentAgencyDefinition(
    records,
    "capability",
    capabilityId,
  );
  const capabilityRevision = capability
    ? revisionFromRecordId(capability.recordId)
    : null;
  if (!capabilityRevision) {
    return {
      status: "unavailable",
      capabilityRevision: null,
      candidates: [],
    };
  }
  const candidates = currentAgencyDefinitions(records)
    .filter((record) => {
      if (record.kind !== "implementation") return false;
      const implementation =
        record.data as unknown as ImplementationDefinition;
      return (
        implementation.capabilityRef.id === capabilityId &&
        implementation.compatibleCapabilityRevision === capabilityRevision
      );
    })
    .sort((left, right) => left.data.id.localeCompare(right.data.id));
  if (candidates.length === 1) {
    return {
      status: "resolved",
      capabilityRevision,
      candidates,
      selected: candidates[0],
    };
  }
  if (repositoryBinding) {
    const selected = candidates.find(
      (candidate) => candidate.data.id === repositoryBinding,
    );
    if (selected) {
      return {
        status: "resolved",
        capabilityRevision,
        candidates,
        selected,
      };
    }
  }
  return {
    status: candidates.length > 1 ? "ambiguous" : "unavailable",
    capabilityRevision,
    candidates,
  };
}
