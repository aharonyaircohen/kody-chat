/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern store-catalog-import-api
 * @ai-summary Activate or remove a simple Store asset reference.
 */

import type { Octokit } from "@octokit/rest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import {
  companyStoreAssetPath,
  listCompanyStoreDirectorySafe,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import {
  getEngineConfig,
  writeConfigPatch,
  type ConfigPatch,
} from "@kody-ade/base/engine/config";
import { listStoreCommandFiles } from "@kody-ade/workspace/commands/files";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { listStoreAgentFiles } from "@dashboard/lib/agent-files";
import { readCompanyStoreCapabilityFolderFiles } from "@dashboard/lib/capabilities";
import { getBuiltinFeature } from "@dashboard/lib/features/catalog";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import {
  isWorkflowDefinitionId,
  type WorkflowDefinition,
} from "@dashboard/lib/workflow-definitions";
import { listCompanyStoreWorkflowDefinitionFiles } from "@dashboard/lib/workflow-definition-files";
import { readStoreLoop, type StoreLoop } from "@dashboard/lib/store-loops";
import { saveProjectedEngineConfig } from "@dashboard/lib/backend/repo-projection";
import { publishStoreExecutionDefinitions } from "@dashboard/lib/store-definition-activation";
import {
  deleteRepositoryLoop,
  readRepositoryLoop,
  saveRepositoryLoop,
} from "@dashboard/lib/repository-loops";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ImportKind =
  "agent" | "capability" | "workflow" | "loop" | "command" | "feature";
type ActiveField =
  | "activeAgents"
  | "activeCapabilities"
  | "activeWorkflows"
  | "activeCommands"
  | "activeFeatures";

const requestSchema = z.object({
  kind: z.enum([
    "agent",
    "capability",
    "workflow",
    "loop",
    "command",
    "feature",
  ]),
  slug: z.string().min(1).max(128),
});

const fieldByKind: Record<Exclude<ImportKind, "loop">, ActiveField> = {
  agent: "activeAgents",
  capability: "activeCapabilities",
  workflow: "activeWorkflows",
  command: "activeCommands",
  feature: "activeFeatures",
};

function validSlug(kind: ImportKind, slug: string): boolean {
  return kind === "workflow"
    ? isWorkflowDefinitionId(slug)
    : /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug);
}

function append(current: string[] | undefined, values: string[]): string[] {
  return [...new Set([...(current ?? []), ...values])];
}

function without(current: string[] | undefined, value: string): string[] {
  return (current ?? []).filter((entry) => entry !== value);
}

async function writeStoreConfigPatch(
  octokit: Octokit,
  owner: string,
  repo: string,
  patch: ConfigPatch,
  commitMessage: string,
): Promise<void> {
  const { sha } = await writeConfigPatch(
    octokit,
    owner,
    repo,
    patch,
    commitMessage,
  );
  const { config } = await getEngineConfig(octokit, owner, repo, {
    force: true,
  });
  await saveProjectedEngineConfig(owner, repo, config, sha);
}

async function saveStoreWorkflowProjection(
  owner: string,
  repo: string,
  slug: string,
  workflow: WorkflowDefinition,
): Promise<void> {
  await createBackendClient().mutation(backendApi.workflows.save, {
    tenantId: `${owner}/${repo}`,
    workflowId: slug,
    definition: workflow,
    source: "store",
    updatedAt: new Date().toISOString(),
  });
}

async function removeStoreWorkflowProjection(
  owner: string,
  repo: string,
  slug: string,
): Promise<void> {
  await createBackendClient().mutation(backendApi.workflows.remove, {
    tenantId: `${owner}/${repo}`,
    workflowId: slug,
  });
}

async function readStoreWorkflow(
  octokit: Octokit,
  slug: string,
): Promise<WorkflowDefinition | null> {
  const record = (await listCompanyStoreWorkflowDefinitionFiles(octokit)).find(
    (entry) => entry.id === slug,
  );
  return record?.workflow ?? null;
}

async function readStoreTree(
  octokit: Octokit,
  root: string,
  relative = "",
  files: Record<string, string> = {},
): Promise<Record<string, string>> {
  for (const entry of await listCompanyStoreDirectorySafe(octokit, root)) {
    const path = `${root}/${entry.name}`;
    const filePath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.type === "dir") {
      await readStoreTree(octokit, path, filePath, files);
    } else if (entry.type === "file") {
      const content = await readCompanyStoreText(octokit, path);
      if (content !== null) files[filePath] = content;
    }
  }
  return files;
}

async function publishStoreDefinitions(
  octokit: Octokit,
  owner: string,
  repo: string,
  agentSlugs: readonly string[],
  capabilitySlugs: readonly string[],
): Promise<void> {
  if (agentSlugs.length === 0 && capabilitySlugs.length === 0) return;

  const [agentEntries, capabilityEntries, shared] = await Promise.all([
    Promise.all(
      agentSlugs.map(async (slug) => {
        const path = await companyStoreAssetPath(
          octokit,
          "agents",
          `${slug}.md`,
        );
        const raw = await readCompanyStoreText(octokit, path);
        if (raw === null) {
          throw Object.assign(new Error(`Store Agent "${slug}" not found.`), {
            status: 404,
          });
        }
        return [slug, raw] as const;
      }),
    ),
    Promise.all(
      capabilitySlugs.map(async (slug) => {
        const files = await readCompanyStoreCapabilityFolderFiles(
          slug,
          octokit,
        );
        if (!files) {
          throw Object.assign(
            new Error(`Store Capability "${slug}" not found.`),
            { status: 404 },
          );
        }
        return [slug, files] as const;
      }),
    ),
    capabilitySlugs.length === 0
      ? Promise.resolve({})
      : companyStoreAssetPath(octokit, "shared").then((root) =>
          readStoreTree(octokit, root),
        ),
  ]);

  const client = createBackendClient();
  await publishStoreExecutionDefinitions({
    tenantId: `${owner}/${repo}`,
    agents: Object.fromEntries(agentEntries),
    capabilities: Object.fromEntries(capabilityEntries),
    shared,
    createdAt: new Date().toISOString(),
    publish: (definition) =>
      client.mutation(backendApi.definitions.publish, definition),
  });
}

async function retireStoreDefinition(
  owner: string,
  repo: string,
  kind: "agent" | "capability",
  slug: string,
): Promise<void> {
  await createBackendClient().mutation(backendApi.definitions.retire, {
    tenantId: `${owner}/${repo}`,
    kind,
    slug,
  });
}

async function assertExists(
  octokit: Octokit,
  kind: ImportKind,
  slug: string,
): Promise<WorkflowDefinition | StoreLoop | null> {
  if (kind === "agent") {
    const found = (await listStoreAgentFiles(octokit)).some(
      (entry) => entry.slug === slug,
    );
    if (!found)
      throw Object.assign(new Error("Store Agent not found."), { status: 404 });
  } else if (kind === "capability") {
    if (!(await readCompanyStoreCapabilityFolderFiles(slug, octokit))) {
      throw Object.assign(new Error("Store Capability not found."), {
        status: 404,
      });
    }
  } else if (kind === "workflow") {
    const workflow = await readStoreWorkflow(octokit, slug);
    if (!workflow) {
      throw Object.assign(new Error("Store Workflow not found."), {
        status: 404,
      });
    }
    return workflow;
  } else if (kind === "loop") {
    const loop = await readStoreLoop(octokit, slug);
    if (!loop) {
      throw Object.assign(new Error("Store Loop not found."), { status: 404 });
    }
    return loop;
  } else if (kind === "command") {
    const found = (await listStoreCommandFiles(new Set(), octokit)).some(
      (entry) => entry.slug === slug,
    );
    if (!found)
      throw Object.assign(new Error("Store Command not found."), {
        status: 404,
      });
  } else if (!getBuiltinFeature(slug)) {
    throw Object.assign(new Error("Store Feature not found."), { status: 404 });
  }
  return null;
}

async function activeWorkflowBlockers(
  octokit: Octokit,
  activeWorkflowIds: string[] | undefined,
  kind: "agent" | "capability",
  slug: string,
) {
  const active = new Set(activeWorkflowIds ?? []);
  return (await listCompanyStoreWorkflowDefinitionFiles(octokit))
    .filter(
      (entry) =>
        active.has(entry.id) &&
        (kind === "agent"
          ? entry.workflow.agent === slug
          : entry.workflow.capabilities.includes(slug)),
    )
    .map((entry) => ({
      kind: "workflow" as const,
      slug: entry.id,
      title: entry.workflow.name || entry.id,
    }));
}

async function activate(
  octokit: Octokit,
  owner: string,
  repo: string,
  kind: ImportKind,
  slug: string,
) {
  const workflow = await assertExists(octokit, kind, slug);
  if (kind === "loop") {
    const storeLoop = workflow as StoreLoop;
    await activate(
      octokit,
      owner,
      repo,
      storeLoop.loop.target.kind,
      storeLoop.loop.target.id,
    );
    const existing = await readRepositoryLoop(octokit, owner, repo, slug);
    if (existing) return { imported: false, status: "already_local" as const };
    await saveRepositoryLoop(
      octokit,
      owner,
      repo,
      storeLoop.loop,
      `chore(kody): add store loop ${slug}`,
    );
    return { imported: true, status: "imported" as const };
  }
  const { config, sha } = await getEngineConfig(octokit, owner, repo, {
    force: true,
  });
  const company = config.company;
  const patch: ConfigPatch = {};
  const agentSlugs =
    kind === "workflow" && workflow
      ? [(workflow as WorkflowDefinition).agent]
      : kind === "agent"
        ? [slug]
        : [];
  const capabilitySlugs =
    kind === "workflow" && workflow
      ? (workflow as WorkflowDefinition).capabilities
      : kind === "capability"
        ? [slug]
        : [];

  await publishStoreDefinitions(
    octokit,
    owner,
    repo,
    agentSlugs,
    capabilitySlugs,
  );

  if (kind === "workflow" && workflow) {
    const workflowDefinition = workflow as WorkflowDefinition;
    patch.activeWorkflows = append(company?.activeWorkflows, [slug]);
    patch.activeCapabilities = append(
      company?.activeCapabilities,
      workflowDefinition.capabilities,
    );
    patch.activeAgents = append(company?.activeAgents, [
      workflowDefinition.agent,
    ]);
  } else {
    const field = fieldByKind[kind];
    const next = append(company?.[field] as string[] | undefined, [slug]);
    (patch as Record<ActiveField, string[] | undefined>)[field] = next;
  }

  const changed = Object.entries(patch).some(([field, value]) => {
    const current = company?.[field as ActiveField] as string[] | undefined;
    return JSON.stringify(current ?? []) !== JSON.stringify(value ?? []);
  });
  if (!changed) {
    await saveProjectedEngineConfig(owner, repo, config, sha);
    if (kind === "workflow" && workflow) {
      await saveStoreWorkflowProjection(
        owner,
        repo,
        slug,
        workflow as WorkflowDefinition,
      );
    }
    return { imported: false, status: "already_local" as const };
  }

  await writeStoreConfigPatch(
    octokit,
    owner,
    repo,
    patch,
    `chore(kody): add store ${kind} ${slug}`,
  );
  if (kind === "workflow" && workflow) {
    await saveStoreWorkflowProjection(
      owner,
      repo,
      slug,
      workflow as WorkflowDefinition,
    );
  }
  return { imported: true, status: "imported" as const };
}

async function deactivate(
  octokit: Octokit,
  owner: string,
  repo: string,
  kind: ImportKind,
  slug: string,
) {
  const { config, sha } = await getEngineConfig(octokit, owner, repo, {
    force: true,
  });
  if (kind === "loop") {
    const existing = await readRepositoryLoop(octokit, owner, repo, slug);
    if (!existing) {
      return { removed: false, status: "already_missing" as const };
    }
    await deleteRepositoryLoop(
      octokit,
      owner,
      repo,
      slug,
      `chore(kody): remove store loop ${slug}`,
    );
    return { removed: true, status: "removed" as const };
  }
  const field = fieldByKind[kind];
  const current = config.company?.[field] as string[] | undefined;
  const next = without(current, slug);
  if (next.length === (current ?? []).length) {
    await saveProjectedEngineConfig(owner, repo, config, sha);
    if (kind === "workflow") {
      await removeStoreWorkflowProjection(owner, repo, slug);
    } else if (kind === "agent" || kind === "capability") {
      await retireStoreDefinition(owner, repo, kind, slug);
    }
    return { removed: false, status: "already_missing" as const };
  }

  if (kind === "agent" || kind === "capability") {
    const blockers = await activeWorkflowBlockers(
      octokit,
      config.company?.activeWorkflows,
      kind,
      slug,
    );
    if (blockers.length) {
      throw Object.assign(
        new Error(`${kind} "${slug}" is used by an active Workflow.`),
        { status: 409, blockers },
      );
    }
  }

  const patch = {
    [field]: next.length ? next : null,
  } as ConfigPatch;
  await writeStoreConfigPatch(
    octokit,
    owner,
    repo,
    patch,
    `chore(kody): remove store ${kind} ${slug}`,
  );
  if (kind === "workflow") {
    await removeStoreWorkflowProjection(owner, repo, slug);
  } else if (kind === "agent" || kind === "capability") {
    await retireStoreDefinition(owner, repo, kind, slug);
  }
  return { removed: true, status: "removed" as const };
}

function errorResponse(error: unknown) {
  const details = error as {
    status?: number;
    blockers?: Array<{ kind: string; slug: string; title?: string }>;
  };
  const status = details.status ?? 500;
  return NextResponse.json(
    {
      error:
        status === 404
          ? "store_item_not_found"
          : status === 409
            ? "store_reference_in_use"
            : "store_import_failed",
      message: error instanceof Error ? error.message : "Unknown error",
      ...(details.blockers ? { blockers: details.blockers } : {}),
    },
    { status },
  );
}

async function handle(req: NextRequest, remove: boolean) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.format() },
        { status: 400 },
      );
    }
    const verified = await verifyActorLogin(req, undefined);
    if ("status" in verified) return verified;
    const { kind, slug } = parsed.data;
    if (!validSlug(kind, slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_octokit" }, { status: 401 });
    }
    const result = remove
      ? await deactivate(octokit, auth.owner, auth.repo, kind, slug)
      : await activate(octokit, auth.owner, auth.repo, kind, slug);
    return NextResponse.json({
      kind,
      slug,
      path: kind === "loop" ? "loops" : `company.${fieldByKind[kind]}`,
      ...result,
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    clearGitHubContext();
  }
}

export function POST(req: NextRequest) {
  return handle(req, false);
}

export function DELETE(req: NextRequest) {
  return handle(req, true);
}
