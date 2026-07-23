/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern store-catalog-import-api
 * @ai-summary Add one Store catalog asset by reference.
 */

import type { Octokit } from "@octokit/rest";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createCapabilityDefinition } from "@kody-ade/agency-domain";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import {
  listCompanyStoreAssetSlugs,
  listCompanyStoreMarkdownAssetSlugs,
  companyStoreAssetPath,
  readCompanyStoreText,
} from "@dashboard/lib/company-store/assets";
import {
  agencyDefinitionRecordId,
  applyStoredAgencyModelChange,
} from "@kody-ade/agency/backend/agency-model-store";
import {
  listStoreImplementations,
  readStoreImplementation,
} from "@kody-ade/agency/implementations/files";
import { publishStoreImplementationPackage } from "@kody-ade/agency/implementations/publish";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import {
  getEngineConfig,
  writeConfigPatch,
  type ActiveGoalConfigEntry,
  type ConfigPatch,
} from "@kody-ade/base/engine/config";
import {
  readCompanyStoreCapabilityFolderFiles,
  readResolvedCapabilityFile,
} from "@dashboard/lib/capabilities";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import {
  definitionVersion,
  type DefinitionBundle,
} from "@kody-ade/backend/definition-bundle";
import { listCompanyStoreGoalTemplateFiles } from "@dashboard/lib/managed-goals-files";
import {
  managedGoalModel,
  type ManagedGoalState,
} from "@dashboard/lib/managed-goals";
import { getBuiltinFeature } from "@dashboard/lib/features/catalog";
import { isWorkflowDefinitionId } from "@dashboard/lib/workflow-definitions";
import { listCompanyStoreWorkflowDefinitionFiles } from "@dashboard/lib/workflow-definition-files";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ImportKind =
  | "agent"
  | "capability"
  | "implementation"
  | "agentGoal"
  | "agentLoop"
  | "workflow"
  | "command"
  | "feature";

type ActiveConfigField =
  | "activeAgents"
  | "activeCapabilities"
  | "activeCommands"
  | "activeGoals"
  | "activeWorkflows"
  | "activeFeatures";

type ImportResult = {
  imported: boolean;
  status: "imported" | "already_local";
  path: string;
};

type RemoveResult = {
  removed: boolean;
  status: "removed" | "already_missing";
  path: string;
};

type StoreReferenceBlocker = {
  kind: ImportKind;
  slug: string;
  title?: string;
};

type ActivationPlan = {
  activeAgents: string[];
  activeCapabilities: string[];
  activeCommands: string[];
  activeGoals: string[];
  activeWorkflows: string[];
  activeFeatures: string[];
};

const importSchema = z.object({
  kind: z.enum([
    "agent",
    "capability",
    "implementation",
    "agentGoal",
    "agentLoop",
    "workflow",
    "command",
    "feature",
  ]),
  slug: z.string().min(1).max(128),
});

function validSlug(kind: ImportKind, slug: string): boolean {
  switch (kind) {
    case "agent":
    case "capability":
    case "implementation":
    case "agentGoal":
    case "agentLoop":
    case "command":
    case "feature":
      return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug);
    case "workflow":
      return isWorkflowDefinitionId(slug);
  }
}

function configFieldFor(
  kind: Exclude<ImportKind, "implementation">,
): ActiveConfigField {
  if (kind === "agent") return "activeAgents";
  if (kind === "capability") return "activeCapabilities";
  if (kind === "command") return "activeCommands";
  if (kind === "workflow") return "activeWorkflows";
  if (kind === "feature") return "activeFeatures";
  return "activeGoals";
}

function configPathFor(kind: ImportKind): string {
  if (kind === "implementation") return "execution.capabilityBindings";
  return `company.${configFieldFor(kind)}`;
}

function activeGoalSlug(entry: ActiveGoalConfigEntry): string {
  return typeof entry === "string" ? entry : entry.template;
}

function addSlugs(entries: string[] | undefined, slugs: string[]): string[] {
  return [...new Set([...(entries ?? []), ...slugs])];
}

function addGoals(
  entries: ActiveGoalConfigEntry[] | undefined,
  slugs: string[],
): ActiveGoalConfigEntry[] {
  const next = [...(entries ?? [])];
  for (const slug of slugs) {
    if (!next.some((entry) => activeGoalSlug(entry) === slug)) {
      next.push(slug);
    }
  }
  return next;
}

function sameStringList(a: string[] | undefined, b: string[]): boolean {
  const current = a ?? [];
  return (
    current.length === b.length && current.every((value, i) => value === b[i])
  );
}

function hasGoal(
  entries: ActiveGoalConfigEntry[] | undefined,
  slug: string,
): boolean {
  return (entries ?? []).some((entry) => activeGoalSlug(entry) === slug);
}

function removeGoal(
  entries: ActiveGoalConfigEntry[] | undefined,
  slug: string,
): ActiveGoalConfigEntry[] {
  return (entries ?? []).filter((entry) => activeGoalSlug(entry) !== slug);
}

function emptyActivationPlan(): ActivationPlan {
  return {
    activeAgents: [],
    activeCapabilities: [],
    activeCommands: [],
    activeGoals: [],
    activeWorkflows: [],
    activeFeatures: [],
  };
}

function addPlanSlug(
  plan: ActivationPlan,
  field: keyof ActivationPlan,
  slug: string | null | undefined,
): void {
  if (!slug) return;
  if (!plan[field].includes(slug)) plan[field].push(slug);
}

function dependencyNotFound(kind: string, slug: string): Error {
  return Object.assign(
    new Error(`Store dependency "${slug}" (${kind}) was not found.`),
    { status: 404 },
  );
}

function storeReferenceInUse(
  kind: ImportKind,
  slug: string,
  blockers: StoreReferenceBlocker[],
): Error {
  return Object.assign(
    new Error(
      `Store ${kind} "${slug}" is used by ${blockers
        .map((blocker) => blocker.title || blocker.slug)
        .join(", ")}.`,
    ),
    { status: 409, blockers },
  );
}

async function assertStoreItemExists(
  octokit: Octokit,
  kind: ImportKind,
  slug: string,
): Promise<void> {
  if (kind === "agent") {
    const slugs = await listCompanyStoreMarkdownAssetSlugs(
      octokit,
      "agents",
      (candidate) => validSlug("agent", candidate),
    );
    if (slugs.includes(slug)) return;
  } else if (kind === "capability") {
    const slugs = await listCompanyStoreAssetSlugs(
      octokit,
      "capabilities",
      (candidate) => validSlug("capability", candidate),
    );
    if (slugs.includes(slug)) return;
  } else if (kind === "implementation") {
    const implementations = await listStoreImplementations(octokit);
    if (implementations.some((implementation) => implementation.id === slug))
      return;
  } else if (kind === "command") {
    const slugs = await listCompanyStoreMarkdownAssetSlugs(
      octokit,
      "commands",
      (candidate) => validSlug("command", candidate),
    );
    if (slugs.includes(slug)) return;
  } else if (kind === "workflow") {
    const workflows = await listCompanyStoreWorkflowDefinitionFiles(octokit);
    if (workflows.some((workflow) => workflow.id === slug)) return;
  } else if (kind === "feature") {
    if (getBuiltinFeature(slug)) return;
  } else {
    const goals = await listCompanyStoreGoalTemplateFiles(octokit);
    if (goals.some((goal) => goal.id === slug)) return;
  }

  throw Object.assign(new Error(`Store item "${slug}" was not found.`), {
    status: 404,
  });
}

async function addCapabilityDependencies(
  octokit: Octokit,
  plan: ActivationPlan,
  slug: string,
): Promise<void> {
  if (!validSlug("capability", slug)) {
    throw dependencyNotFound("capability", slug);
  }

  addPlanSlug(plan, "activeCapabilities", slug);

  const capability = await readResolvedCapabilityFile(slug, octokit);
  if (!capability) throw dependencyNotFound("capability", slug);

  if (capability.agent) {
    if (!validSlug("agent", capability.agent)) {
      throw dependencyNotFound("agent", capability.agent);
    }
    addPlanSlug(plan, "activeAgents", capability.agent);
  }
}

function goalCapabilitySlugs(state: ManagedGoalState): string[] {
  const compatibility = state as ManagedGoalState & {
    capabilities?: unknown;
  };
  if (Array.isArray(compatibility.capabilities)) {
    return compatibility.capabilities.filter(
      (capability): capability is string => typeof capability === "string",
    );
  }
  return [];
}

function goalWorkflowSlug(state: ManagedGoalState): string | null {
  if (state.workflowRef?.id) return state.workflowRef.id;
  return state.loopTarget?.type === "workflow" ? state.loopTarget.id : null;
}

async function addWorkflowDependencies(
  octokit: Octokit,
  plan: ActivationPlan,
  slug: string,
): Promise<void> {
  addPlanSlug(plan, "activeWorkflows", slug);
  const workflows = await listCompanyStoreWorkflowDefinitionFiles(octokit);
  const workflow = workflows.find((item) => item.id === slug);
  if (!workflow) throw dependencyNotFound("workflow", slug);

  for (const capabilitySlug of workflow.workflow.capabilities) {
    await addCapabilityDependencies(octokit, plan, capabilitySlug);
  }
}

async function removalBlockersFor({
  octokit,
  config,
  kind,
  slug,
}: {
  octokit: Octokit;
  config: {
    company?: {
      activeCapabilities?: string[];
      activeGoals?: ActiveGoalConfigEntry[];
      activeWorkflows?: string[];
    };
  };
  kind: ImportKind;
  slug: string;
}): Promise<StoreReferenceBlocker[]> {
  if (kind === "agent") {
    const activeCapabilities = config.company?.activeCapabilities ?? [];
    const blockers: StoreReferenceBlocker[] = [];
    for (const capabilitySlug of activeCapabilities) {
      const capability = await readResolvedCapabilityFile(
        capabilitySlug,
        octokit,
      );
      if (capability?.agent === slug) {
        blockers.push({ kind: "capability", slug: capabilitySlug });
      }
    }
    return blockers;
  }

  if (kind !== "capability") return [];

  const activeWorkflows = new Set(config.company?.activeWorkflows ?? []);
  const activeGoals = new Set(
    (config.company?.activeGoals ?? []).map(activeGoalSlug),
  );
  const [workflows, goals] = await Promise.all([
    listCompanyStoreWorkflowDefinitionFiles(octokit),
    listCompanyStoreGoalTemplateFiles(octokit),
  ]);
  const blockers: StoreReferenceBlocker[] = [];

  for (const workflow of workflows) {
    if (
      activeWorkflows.has(workflow.id) &&
      workflow.workflow.capabilities.includes(slug)
    ) {
      blockers.push({
        kind: "workflow",
        slug: workflow.id,
        title: workflow.workflow.name || workflow.id,
      });
    }
  }

  for (const goal of goals) {
    if (
      activeGoals.has(goal.id) &&
      goalCapabilitySlugs(goal.state).includes(slug)
    ) {
      blockers.push({
        kind: managedGoalModel(goal),
        slug: goal.id,
        title: goal.state.destination?.outcome || goal.id,
      });
    }
  }

  return blockers;
}

async function assertRemovableReference(args: {
  octokit: Octokit;
  config: {
    company?: {
      activeCapabilities?: string[];
      activeGoals?: ActiveGoalConfigEntry[];
      activeWorkflows?: string[];
    };
  };
  kind: ImportKind;
  slug: string;
}): Promise<void> {
  const blockers = await removalBlockersFor(args);
  if (blockers.length > 0) {
    throw storeReferenceInUse(args.kind, args.slug, blockers);
  }
}

async function activationPlanFor(
  octokit: Octokit,
  kind: ImportKind,
  slug: string,
): Promise<ActivationPlan> {
  const plan = emptyActivationPlan();

  if (kind === "agent") {
    addPlanSlug(plan, "activeAgents", slug);
    return plan;
  }

  if (kind === "capability") {
    await addCapabilityDependencies(octokit, plan, slug);
    return plan;
  }

  if (kind === "implementation") {
    const implementation = await readStoreImplementation(octokit, slug);
    if (!implementation) throw dependencyNotFound(kind, slug);
    await addCapabilityDependencies(
      octokit,
      plan,
      implementation.capabilityId,
    );
    if (implementation.agentId) {
      addPlanSlug(plan, "activeAgents", implementation.agentId);
    }
    return plan;
  }

  if (kind === "command") {
    addPlanSlug(plan, "activeCommands", slug);
    return plan;
  }

  if (kind === "feature") {
    addPlanSlug(plan, "activeFeatures", slug);
    return plan;
  }

  if (kind === "workflow") {
    await addWorkflowDependencies(octokit, plan, slug);
    return plan;
  }

  addPlanSlug(plan, "activeGoals", slug);
  const goals = await listCompanyStoreGoalTemplateFiles(octokit);
  const goal = goals.find((item) => item.id === slug);
  if (!goal) throw dependencyNotFound(kind, slug);

  for (const capabilitySlug of goalCapabilitySlugs(goal.state)) {
    await addCapabilityDependencies(octokit, plan, capabilitySlug);
  }
  const workflowSlug = goalWorkflowSlug(goal.state);
  if (workflowSlug) {
    await addWorkflowDependencies(octokit, plan, workflowSlug);
  }

  return plan;
}

async function publishDefinition(
  tenantId: string,
  kind: "agent" | "capability" | "goal" | "implementation" | "asset",
  slug: string,
  files: Record<string, string>,
): Promise<void> {
  const bundle: DefinitionBundle = { schemaVersion: 1, files };
  await createBackendClient().mutation(backendApi.definitions.publish, {
    tenantId,
    kind,
    slug,
    version: definitionVersion(bundle),
    bundle,
    source: "store",
    createdAt: new Date().toISOString(),
  });
}

async function publishActivationPlan(
  octokit: Octokit,
  owner: string,
  repo: string,
  plan: ActivationPlan,
): Promise<void> {
  const tenantId = `${owner}/${repo}`;

  for (const slug of plan.activeAgents) {
    const path = await companyStoreAssetPath(octokit, "agents", `${slug}.md`);
    const raw = await readCompanyStoreText(octokit, path);
    if (raw === null) throw dependencyNotFound("agent", slug);
    await publishDefinition(tenantId, "agent", slug, { "agent.md": raw });
  }

  for (const slug of plan.activeCapabilities) {
    const files = await readCompanyStoreCapabilityFolderFiles(slug, octokit);
    if (!files) throw dependencyNotFound("capability", slug);
    await publishDefinition(tenantId, "capability", slug, files);
  }

  if (plan.activeGoals.length > 0) {
    const goals = await listCompanyStoreGoalTemplateFiles(octokit);
    for (const slug of plan.activeGoals) {
      const goal = goals.find((candidate) => candidate.id === slug);
      if (!goal) throw dependencyNotFound("goal", slug);
      await publishDefinition(tenantId, "goal", slug, {
        "state.json": `${JSON.stringify(goal.state, null, 2)}\n`,
      });
    }
  }

  if (plan.activeWorkflows.length > 0) {
    const workflows = await listCompanyStoreWorkflowDefinitionFiles(octokit);
    for (const slug of plan.activeWorkflows) {
      const workflow = workflows.find((candidate) => candidate.id === slug);
      if (!workflow) throw dependencyNotFound("workflow", slug);
      await createBackendClient().mutation(backendApi.workflows.save, {
        tenantId,
        workflowId: slug,
        definition: workflow.workflow,
        source: "store",
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

async function publishAgencyImplementation(
  octokit: Octokit,
  owner: string,
  repo: string,
  implementationId: string,
): Promise<{
  capabilityId: string;
  implementationId: string;
}> {
  const implementation = await readStoreImplementation(
    octokit,
    implementationId,
  );
  if (!implementation)
    throw dependencyNotFound("implementation", implementationId);
  const capabilityRoot = await companyStoreAssetPath(
    octokit,
    "capabilities",
    implementation.capabilityId,
  );
  const capabilityRaw = await readCompanyStoreText(
    octokit,
    `${capabilityRoot}/definition.json`,
  );
  if (!capabilityRaw)
    throw dependencyNotFound("capability", implementation.capabilityId);
  let capability: ReturnType<typeof createCapabilityDefinition>;
  try {
    capability = createCapabilityDefinition(JSON.parse(capabilityRaw));
  } catch {
    throw Object.assign(
      new Error(
        `Store Capability "${implementation.capabilityId}" has an invalid contract.`,
      ),
      { status: 409 },
    );
  }
  const capabilityRecordId = agencyDefinitionRecordId(
    "capability",
    capability,
  );
  const capabilityRevision = capabilityRecordId.split(":").at(-1);
  if (
    capabilityRevision !== implementation.compatibleCapabilityRevision
  ) {
    throw Object.assign(
      new Error(
        `Implementation "${implementationId}" is not compatible with the current Capability revision.`,
      ),
      { status: 409 },
    );
  }
  await publishStoreImplementationPackage(
    octokit,
    `${owner}/${repo}`,
    implementation,
  );
  const createdAt = new Date().toISOString();
  await applyStoredAgencyModelChange({
    owner,
    repo,
    change: {
      definitions: [
        {
          recordId: capabilityRecordId,
          kind: "capability",
          schemaVersion: 1,
          data: capability,
          createdAt,
        },
        {
          recordId: agencyDefinitionRecordId(
            "implementation",
            implementation.definition,
          ),
          kind: "implementation",
          schemaVersion: 1,
          data: implementation.definition,
          createdAt,
        },
      ],
      states: [],
    },
  });
  return {
    capabilityId: implementation.capabilityId,
    implementationId: implementation.id,
  };
}

async function addStoreReference({
  octokit,
  owner,
  repo,
  kind,
  slug,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  kind: ImportKind;
  slug: string;
}): Promise<ImportResult> {
  await assertStoreItemExists(octokit, kind, slug);

  const { config } = await getEngineConfig(octokit, owner, repo, {
    force: true,
  });
  const plan = await activationPlanFor(octokit, kind, slug);
  await publishActivationPlan(octokit, owner, repo, plan);
  if (kind === "implementation") {
    const published = await publishAgencyImplementation(
      octokit,
      owner,
      repo,
      slug,
    );
    const nextActiveCapabilities = addSlugs(
      config.company?.activeCapabilities,
      plan.activeCapabilities,
    );
    const nextBindings = {
      ...(config.execution?.capabilityBindings ?? {}),
      [published.capabilityId]: published.implementationId,
    };
    const alreadySelected =
      config.execution?.capabilityBindings?.[published.capabilityId] ===
        published.implementationId &&
      sameStringList(
        config.company?.activeCapabilities,
        nextActiveCapabilities,
      );
    if (alreadySelected) {
      return {
        imported: false,
        status: "already_local",
        path: configPathFor(kind),
      };
    }
    await writeConfigPatch(
      octokit,
      owner,
      repo,
      {
        activeCapabilities: nextActiveCapabilities,
        capabilityBindings: nextBindings,
      },
      `chore(kody): select store implementation ${slug}`,
    );
    return {
      imported: true,
      status: "imported",
      path: configPathFor(kind),
    };
  }
  const nextActiveAgents =
    plan.activeAgents.length > 0
      ? addSlugs(config.company?.activeAgents, plan.activeAgents)
      : undefined;
  const nextActiveCapabilities =
    plan.activeCapabilities.length > 0
      ? addSlugs(config.company?.activeCapabilities, plan.activeCapabilities)
      : undefined;
  const nextActiveCommands =
    plan.activeCommands.length > 0
      ? addSlugs(config.company?.activeCommands, plan.activeCommands)
      : undefined;
  const nextActiveWorkflows =
    plan.activeWorkflows.length > 0
      ? addSlugs(config.company?.activeWorkflows, plan.activeWorkflows)
      : undefined;
  const nextActiveFeatures =
    plan.activeFeatures.length > 0
      ? addSlugs(config.company?.activeFeatures, plan.activeFeatures)
      : undefined;
  const nextActiveGoals =
    plan.activeGoals.length > 0 &&
    plan.activeGoals.some(
      (goalSlug) => !hasGoal(config.company?.activeGoals, goalSlug),
    )
      ? addGoals(config.company?.activeGoals, plan.activeGoals)
      : undefined;

  const patch: ConfigPatch = {
    activeAgents:
      nextActiveAgents &&
      !sameStringList(config.company?.activeAgents, nextActiveAgents)
        ? nextActiveAgents
        : undefined,
    activeCapabilities:
      nextActiveCapabilities &&
      !sameStringList(
        config.company?.activeCapabilities,
        nextActiveCapabilities,
      )
        ? nextActiveCapabilities
        : undefined,
    activeCommands:
      nextActiveCommands &&
      !sameStringList(config.company?.activeCommands, nextActiveCommands)
        ? nextActiveCommands
        : undefined,
    activeWorkflows:
      nextActiveWorkflows &&
      !sameStringList(config.company?.activeWorkflows, nextActiveWorkflows)
        ? nextActiveWorkflows
        : undefined,
    activeGoals: nextActiveGoals,
    activeFeatures:
      nextActiveFeatures &&
      !sameStringList(config.company?.activeFeatures, nextActiveFeatures)
        ? nextActiveFeatures
        : undefined,
  };

  if (Object.values(patch).every((value) => value === undefined)) {
    return {
      imported: false,
      status: "already_local",
      path: configPathFor(kind),
    };
  }

  await writeConfigPatch(
    octokit,
    owner,
    repo,
    patch,
    `chore(kody): add store ${kind} ${slug}`,
  );

  return {
    imported: true,
    status: "imported",
    path: configPathFor(kind),
  };
}

async function removeStoreReference({
  octokit,
  owner,
  repo,
  kind,
  slug,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  kind: ImportKind;
  slug: string;
}): Promise<RemoveResult> {
  const { config } = await getEngineConfig(octokit, owner, repo, {
    force: true,
  });
  const patch: ConfigPatch = {};
  const path = configPathFor(kind);

  if (kind === "implementation") {
    const implementation = await readStoreImplementation(octokit, slug);
    if (!implementation) {
      return { removed: false, status: "already_missing", path };
    }
    const currentBindings = config.execution?.capabilityBindings ?? {};
    if (currentBindings[implementation.capabilityId] !== slug) {
      return { removed: false, status: "already_missing", path };
    }
    const nextBindings = { ...currentBindings };
    delete nextBindings[implementation.capabilityId];
    patch.capabilityBindings =
      Object.keys(nextBindings).length > 0 ? nextBindings : null;
  } else if (kind === "agent") {
    const current = config.company?.activeAgents ?? [];
    const next = current.filter((value) => value !== slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    await assertRemovableReference({ octokit, config, kind, slug });
    patch.activeAgents = next.length > 0 ? next : null;
  } else if (kind === "capability") {
    const current = config.company?.activeCapabilities ?? [];
    const next = current.filter((value) => value !== slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    await assertRemovableReference({ octokit, config, kind, slug });
    patch.activeCapabilities = next.length > 0 ? next : null;
  } else if (kind === "command") {
    const current = config.company?.activeCommands ?? [];
    const next = current.filter((value) => value !== slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    patch.activeCommands = next.length > 0 ? next : null;
  } else if (kind === "workflow") {
    const current = config.company?.activeWorkflows ?? [];
    const next = current.filter((value) => value !== slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    patch.activeWorkflows = next.length > 0 ? next : null;
  } else if (kind === "feature") {
    const current = config.company?.activeFeatures ?? [];
    const next = current.filter((value) => value !== slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    patch.activeFeatures = next.length > 0 ? next : null;
  } else {
    const current = config.company?.activeGoals ?? [];
    const next = removeGoal(current, slug);
    if (next.length === current.length) {
      return { removed: false, status: "already_missing", path };
    }
    patch.activeGoals = next.length > 0 ? next : null;
  }

  await writeConfigPatch(
    octokit,
    owner,
    repo,
    patch,
    `chore(kody): remove store ${kind} ${slug}`,
  );

  const tenantId = `${owner}/${repo}`;
  if (
    kind === "agent" ||
    kind === "capability" ||
    kind === "implementation"
  ) {
    await createBackendClient().mutation(backendApi.definitions.retire, {
      tenantId,
      kind,
      slug,
    });
  } else if (kind === "agentGoal" || kind === "agentLoop") {
    await createBackendClient().mutation(backendApi.definitions.retire, {
      tenantId,
      kind: "goal",
      slug,
    });
  } else if (kind === "workflow") {
    await createBackendClient().mutation(backendApi.workflows.remove, {
      tenantId,
      workflowId: slug,
    });
  }

  return { removed: true, status: "removed", path };
}

function errorResponse(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  }
  if (status === 404) {
    return NextResponse.json(
      {
        error: "store_item_not_found",
        message:
          error instanceof Error ? error.message : "Store item not found.",
      },
      { status: 404 },
    );
  }
  if (status === 409) {
    return NextResponse.json(
      {
        error: "store_reference_in_use",
        message:
          error instanceof Error ? error.message : "Store reference is in use.",
        blockers:
          (error as { blockers?: StoreReferenceBlocker[] })?.blockers ?? [],
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      error: "store_import_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
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
    const body = await req.json().catch(() => null);
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const verify = await verifyActorLogin(req, undefined);
    if ("status" in verify) return verify;

    const { kind, slug } = parsed.data;
    if (!validSlug(kind, slug)) {
      return NextResponse.json(
        { error: "invalid_slug", message: `Invalid ${kind} slug: "${slug}".` },
        { status: 400 },
      );
    }

    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_octokit" }, { status: 401 });
    }

    const result = await addStoreReference({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      kind,
      slug,
    });

    return NextResponse.json({
      kind,
      slug,
      ...result,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  } finally {
    clearGitHubContext();
  }
}

export async function DELETE(req: NextRequest) {
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
    const body = await req.json().catch(() => null);
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const verify = await verifyActorLogin(req, undefined);
    if ("status" in verify) return verify;

    const { kind, slug } = parsed.data;
    if (!validSlug(kind, slug)) {
      return NextResponse.json(
        { error: "invalid_slug", message: `Invalid ${kind} slug: "${slug}".` },
        { status: 400 },
      );
    }

    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_octokit" }, { status: 401 });
    }

    const result = await removeStoreReference({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      kind,
      slug,
    });

    return NextResponse.json({
      kind,
      slug,
      ...result,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  } finally {
    clearGitHubContext();
  }
}
