import type { KodyConfig } from "@kody-ade/base/engine/config";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import type { Octokit } from "@octokit/rest";
import { listCatalogEntries, saveCatalogEntry } from "./catalog";
import { backendApi, getConvexClient, tenantIdFor } from "./convex-backend";
import type { WorkflowDefinitionRecord } from "../workflow-definitions";
import type { CapabilitySummary } from "@kody-ade/agency/capabilities/files";

export async function getProjectedEngineConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ config: KodyConfig; sha: string | null }> {
  try {
    const projected = await listCatalogEntries<{ config: KodyConfig; sha: string | null }>(
      owner,
      repo,
      "config",
    );
    const current = projected.find((entry) => entry.slug === "kody.config.json");
    if (current?.doc?.config) {
      return { config: current.doc.config, sha: current.doc.sha ?? null };
    }
  } catch {
    // Fall through to the authoritative GitHub source during bootstrap.
  }

  const result = await getEngineConfig(octokit, owner, repo);
  await saveCatalogEntry(
    owner,
    repo,
    "config",
    "kody.config.json",
    result,
    "consumer-repo",
    result.sha ?? undefined,
  ).catch(() => undefined);
  return result;
}

export async function listProjectedWorkflows(
  owner: string,
  repo: string,
): Promise<WorkflowDefinitionRecord[]> {
  const docs = (await getConvexClient().query(backendApi.workflows.list, {
    tenantId: tenantIdFor(owner, repo),
  })) as Array<{
    workflowId: string;
    definition: WorkflowDefinitionRecord["workflow"];
    source: "local" | "store";
    updatedAt: string;
  }>;
  return docs.map((doc) => ({
    id: doc.workflowId,
    path: `convex:workflows/${doc.workflowId}`,
    workflow: doc.definition,
    source: doc.source,
    updatedAt: doc.updatedAt,
    readOnly: doc.source === "store",
    runnable: true,
  }));
}

export async function saveProjectedWorkflow(
  owner: string,
  repo: string,
  workflow: WorkflowDefinitionRecord,
): Promise<void> {
  await getConvexClient().mutation(backendApi.workflows.save, {
    tenantId: tenantIdFor(owner, repo),
    workflowId: workflow.id,
    definition: workflow.workflow,
    source: workflow.source === "store" ? "store" : "local",
    updatedAt: workflow.updatedAt ?? new Date().toISOString(),
  });
}

export async function listProjectedCapabilities(
  owner: string,
  repo: string,
  activeStoreSlugs: Set<string>,
): Promise<CapabilitySummary[]> {
  const entries = await listCatalogEntries<CapabilitySummary>(
    owner,
    repo,
    "capability",
  );
  return entries
    .map((entry) => entry.doc)
    .filter(
      (capability) =>
        capability.source !== "store" || activeStoreSlugs.has(capability.slug),
    );
}

export async function saveProjectedCapability(
  owner: string,
  repo: string,
  capability: CapabilitySummary,
): Promise<void> {
  await saveCatalogEntry(
    owner,
    repo,
    "capability",
    capability.slug,
    capability,
    capability.source === "store" ? "company-store" : "state-repo",
    capability.updatedAt ?? undefined,
  );
}
