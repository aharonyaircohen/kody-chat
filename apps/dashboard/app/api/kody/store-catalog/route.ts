/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern store-catalog-api
 * @ai-summary Read-only neutral store catalog.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireKodyAuth,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import {
  setGitHubContext,
  clearGitHubContext,
} from "@dashboard/lib/github-client";
import { listStoreCapabilityFiles } from "@dashboard/lib/capabilities";
import { listStoreAgentFiles } from "@dashboard/lib/agent-files";
import { listStoreCommandFiles } from "@kody-ade/workspace/commands/files";
import { listCompanyStoreGoalTemplateFiles } from "@dashboard/lib/managed-goals-files";
import {
  managedGoalModel,
  type ManagedGoalRecord,
  type ManagedGoalState,
} from "@dashboard/lib/managed-goals";
import { listCompanyStoreWorkflowDefinitionFiles } from "@dashboard/lib/workflow-definition-files";
import {
  getEngineConfig,
  type ActiveGoalConfigEntry,
} from "@kody-ade/base/engine/config";
import { BUILTIN_FEATURES } from "@dashboard/lib/features/catalog";
import { listStoreImplementations } from "@kody-ade/agency/implementations/files";
import { listStoredAgencyDefinitions } from "@kody-ade/agency/backend/agency-model-store";
import { resolveCapabilityImplementations } from "@kody-ade/agency/implementation-resolution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogKind =
  | "agent"
  | "agentGoal"
  | "agentLoop"
  | "workflow"
  | "capability"
  | "implementation"
  | "command"
  | "feature";

interface CatalogReferenceBlocker {
  kind: CatalogKind;
  slug: string;
  title?: string;
}

interface CatalogItem {
  slug: string;
  title: string;
  description: string;
  kind: CatalogKind;
  isWorkflow?: boolean;
  workflowSteps?: string[];
  htmlUrl: string | null;
  action?: string | null;
  agent?: string | null;
  schedule?: string | null;
  installed?: boolean;
  uninstallBlockedBy?: CatalogReferenceBlocker[];
  /** Dashboard route to a setup wizard offered after install (features). */
  setupHref?: string | null;
  capabilityId?: string | null;
  compatibleCapabilityRevision?: string | null;
  implementationType?: "agent" | "script" | null;
  selection?: "repository" | "automatic" | "available";
}

type ActiveCatalogConfig = {
  agents: Set<string>;
  capabilities: Set<string>;
  implementations: Set<string>;
  commands: Set<string>;
  goals: Set<string>;
  workflows: Set<string>;
  features: Set<string>;
};

function activeGoalSlug(entry: ActiveGoalConfigEntry): string {
  return typeof entry === "string" ? entry : entry.template;
}

function isCatalogItemInstalled(
  item: CatalogItem,
  active: ActiveCatalogConfig,
): boolean {
  if (item.kind === "agent") return active.agents.has(item.slug);
  if (item.kind === "capability") return active.capabilities.has(item.slug);
  if (item.kind === "implementation")
    return active.implementations.has(item.slug);
  if (item.kind === "command") return active.commands.has(item.slug);
  if (item.kind === "workflow") return active.workflows.has(item.slug);
  if (item.kind === "feature") return active.features.has(item.slug);
  return active.goals.has(item.slug);
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

function catalogRemovalBlockers(
  item: CatalogItem,
  context: {
    active: ActiveCatalogConfig;
    capabilities: CatalogItem[];
    goalTemplates: ManagedGoalRecord[];
    storeWorkflows: Array<{
      id: string;
      workflow: { name?: string; capabilities: string[] };
    }>;
  },
): CatalogReferenceBlocker[] {
  if (item.kind === "agent") {
    return context.capabilities
      .filter(
        (capability) =>
          context.active.capabilities.has(capability.slug) &&
          capability.agent === item.slug,
      )
      .map((capability) => ({
        kind: "capability",
        slug: capability.slug,
        title: capability.title || capability.slug,
      }));
  }

  if (item.kind !== "capability") return [];

  const workflowBlockers: CatalogReferenceBlocker[] =
    context.storeWorkflows
      .filter(
        (workflow) =>
          context.active.workflows.has(workflow.id) &&
          workflow.workflow.capabilities.includes(item.slug),
      )
      .map((workflow) => ({
        kind: "workflow",
        slug: workflow.id,
        title: workflow.workflow.name || workflow.id,
      }));

  const goalBlockers: CatalogReferenceBlocker[] = context.goalTemplates
    .filter(
      (goal) =>
        context.active.goals.has(goal.id) &&
        goalCapabilitySlugs(goal.state).includes(item.slug),
    )
    .map((goal) => ({
      kind: managedGoalModel(goal),
      slug: goal.id,
      title: goal.state.destination?.outcome || goal.id,
    }));

  return [...workflowBlockers, ...goalBlockers];
}

function firstText(value: string | null | undefined): string {
  const text = (value ?? "")
    .replace(/^#+\s+/gm, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(Boolean);
  return text ?? "";
}

export async function GET(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  setGitHubContext(
    headerAuth.owner,
    headerAuth.repo,
    headerAuth.token,
    headerAuth.storeRepoUrl,
    headerAuth.storeRef,
  );

  try {
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const [
      capabilities,
      agents,
      storeCommands,
      goalTemplates,
      storeWorkflows,
      implementations,
      engineConfig,
      agencyDefinitions,
    ] = await Promise.all([
      listStoreCapabilityFiles(octokit),
      listStoreAgentFiles(octokit),
      listStoreCommandFiles(new Set(), octokit),
      listCompanyStoreGoalTemplateFiles(octokit),
      listCompanyStoreWorkflowDefinitionFiles(octokit),
      listStoreImplementations(octokit),
      getEngineConfig(octokit, headerAuth.owner, headerAuth.repo, {
        force: true,
      }),
      listStoredAgencyDefinitions(headerAuth.owner, headerAuth.repo),
    ]);

    const items: CatalogItem[] = [];
    const config = engineConfig.config;
    const activeCapabilityIds = new Set(
      config.company?.activeCapabilities ?? [],
    );
    const capabilityBindings =
      config.execution?.capabilityBindings ?? {};
    const selectedImplementations = new Map<
      string,
      "repository" | "automatic"
    >();
    for (const capabilityId of activeCapabilityIds) {
      const resolution = resolveCapabilityImplementations(
        agencyDefinitions,
        capabilityId,
        capabilityBindings[capabilityId],
      );
      if (resolution.selected) {
        selectedImplementations.set(
          resolution.selected.data.id,
          capabilityBindings[capabilityId] ? "repository" : "automatic",
        );
      }
    }
    const active = {
      agents: new Set(config.company?.activeAgents ?? []),
      capabilities: activeCapabilityIds,
      implementations: new Set(selectedImplementations.keys()),
      commands: new Set(config.company?.activeCommands ?? []),
      goals: new Set((config.company?.activeGoals ?? []).map(activeGoalSlug)),
      workflows: new Set(config.company?.activeWorkflows ?? []),
      features: new Set(config.company?.activeFeatures ?? []),
    };

    for (const item of capabilities) {
      items.push({
        slug: item.slug,
        title: item.slug,
        description: item.describe,
        kind: "capability",
        isWorkflow: item.isWorkflow === true,
        workflowSteps: item.workflowSteps ?? [],
        htmlUrl: item.htmlUrl,
        agent: item.agent,
        schedule: item.every ?? null,
      });
    }

    for (const item of implementations) {
      items.push({
        slug: item.id,
        title: item.id,
        description: `Implements ${item.capabilityId} with a ${item.type} runtime.`,
        kind: "implementation",
        htmlUrl: item.htmlUrl,
        agent: item.agentId ?? null,
        capabilityId: item.capabilityId,
        compatibleCapabilityRevision: item.compatibleCapabilityRevision,
        implementationType: item.type,
        selection: selectedImplementations.get(item.id) ?? "available",
      });
    }

    for (const item of agents) {
      items.push({
        slug: item.slug,
        title: item.title,
        description: firstText(item.body),
        kind: "agent",
        htmlUrl: item.htmlUrl,
      });
    }

    for (const item of storeCommands) {
      items.push({
        slug: item.slug,
        title: `/${item.slug}`,
        description: item.description || firstText(item.body),
        kind: "command",
        htmlUrl: item.htmlUrl,
      });
    }

    for (const item of goalTemplates) {
      const model = managedGoalModel(item);
      items.push({
        slug: item.id,
        title: item.state.destination.outcome || item.id,
        description: [
          item.state.destination.outcome,
          ...item.state.destination.evidence,
        ]
          .filter(Boolean)
          .join(" - "),
        kind: model,
        htmlUrl: null,
        schedule: item.state.schedule ?? null,
      });
    }

    for (const item of storeWorkflows) {
      items.push({
        slug: item.id,
        title: item.workflow.name || item.id,
        description: item.workflow.capabilities.join(" -> "),
        kind: "workflow",
        htmlUrl: item.htmlUrl ?? null,
      });
    }

    for (const feature of BUILTIN_FEATURES) {
      items.push({
        slug: feature.slug,
        title: feature.title,
        description: feature.description,
        kind: "feature",
        htmlUrl: null,
        setupHref: feature.setupHref ?? null,
      });
    }

    const catalogItems = items
      .map((item) => ({
        ...item,
        installed: isCatalogItemInstalled(item, active),
        uninstallBlockedBy: isCatalogItemInstalled(item, active)
          ? catalogRemovalBlockers(item, {
              active,
              capabilities: items.filter(
                (candidate) => candidate.kind === "capability",
              ),
              goalTemplates,
              storeWorkflows,
            })
          : [],
      }))
      .sort((a, b) =>
        `${a.kind}:${a.slug}`.localeCompare(`${b.kind}:${b.slug}`),
      );

    return NextResponse.json(
      {
        items: catalogItems,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "store_catalog_failed", message },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
