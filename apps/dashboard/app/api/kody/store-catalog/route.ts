/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern store-catalog-api
 * @ai-summary Read-only catalog for the simple Agency assets.
 */

import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { listStoreCommandFiles } from "@kody-ade/workspace/commands/files";
import { listStoreAgentFiles } from "@dashboard/lib/agent-files";
import { listStoreCapabilityFiles } from "@dashboard/lib/capabilities";
import { listCompanyStoreWorkflowDefinitionFiles } from "@dashboard/lib/workflow-definition-files";
import { listStoreLoops } from "@dashboard/lib/store-loops";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { BUILTIN_FEATURES } from "@dashboard/lib/features/catalog";
import {
  clearGitHubContext,
  getOctokit,
  setGitHubContext,
} from "@dashboard/lib/github-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogKind =
  "agent" | "workflow" | "capability" | "loop" | "command" | "feature";

type CatalogItem = {
  slug: string;
  title: string;
  description: string;
  kind: CatalogKind;
  htmlUrl: string | null;
  installed: boolean;
  setupHref?: string | null;
  uninstallBlockedBy: Array<{
    kind: "workflow";
    slug: string;
    title?: string;
  }>;
};

function firstText(value: string | null | undefined): string {
  return (
    (value ?? "")
      .replace(/^#+\s+/gm, "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );
}

export async function GET(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  setGitHubContext(
    auth.owner,
    auth.repo,
    undefined,
    auth.storeRepoUrl,
    auth.storeRef,
  );

  try {
    const octokit = getOctokit();
    const [
      capabilities,
      agents,
      commands,
      workflows,
      loops,
      localLoops,
      engine,
    ] = await Promise.all([
      listStoreCapabilityFiles(octokit),
      listStoreAgentFiles(octokit),
      listStoreCommandFiles(new Set(), octokit),
      listCompanyStoreWorkflowDefinitionFiles(octokit),
      listStoreLoops(octokit),
      createBackendClient().query(api.repoDocs.listByPrefix, {
        tenantId: `${auth.owner}/${auth.repo}`,
        prefix: "loop:",
      }) as Promise<Array<{ kind: string }>>,
      getEngineConfig(octokit, auth.owner, auth.repo, { force: true }),
    ]);
    const config = engine.config.company;
    const active = {
      agent: new Set(config?.activeAgents ?? []),
      capability: new Set(config?.activeCapabilities ?? []),
      command: new Set(config?.activeCommands ?? []),
      workflow: new Set(config?.activeWorkflows ?? []),
      feature: new Set(config?.activeFeatures ?? []),
      loop: new Set(localLoops.map((item) => item.kind.slice("loop:".length))),
    };

    const workflowBlockers = (agent: string) =>
      workflows
        .filter(
          (item) =>
            active.workflow.has(item.id) && item.workflow.agent === agent,
        )
        .map((item) => ({
          kind: "workflow" as const,
          slug: item.id,
          title: item.workflow.name || item.id,
        }));

    const items: CatalogItem[] = [
      ...capabilities.map((item) => ({
        slug: item.slug,
        title: item.slug,
        description: item.describe,
        kind: "capability" as const,
        htmlUrl: item.htmlUrl,
        installed: active.capability.has(item.slug),
        uninstallBlockedBy: [],
      })),
      ...agents.map((item) => ({
        slug: item.slug,
        title: item.title,
        description: firstText(item.body),
        kind: "agent" as const,
        htmlUrl: item.htmlUrl,
        installed: active.agent.has(item.slug),
        uninstallBlockedBy: workflowBlockers(item.slug),
      })),
      ...commands.map((item) => ({
        slug: item.slug,
        title: `/${item.slug}`,
        description: item.description || firstText(item.body),
        kind: "command" as const,
        htmlUrl: item.htmlUrl,
        installed: active.command.has(item.slug),
        uninstallBlockedBy: [],
      })),
      ...workflows.map((item) => ({
        slug: item.id,
        title: item.workflow.name || item.id,
        description: item.workflow.capabilities.join(" -> "),
        kind: "workflow" as const,
        htmlUrl: item.htmlUrl ?? null,
        installed: active.workflow.has(item.id),
        uninstallBlockedBy: [],
      })),
      ...loops.map((item) => ({
        slug: item.slug,
        title: item.slug,
        description: `${item.loop.trigger.type} → ${item.loop.target.kind}/${item.loop.target.id}`,
        kind: "loop" as const,
        htmlUrl: item.htmlUrl,
        installed: active.loop.has(item.slug),
        uninstallBlockedBy: [],
      })),
      ...BUILTIN_FEATURES.map((item) => ({
        slug: item.slug,
        title: item.title,
        description: item.description,
        kind: "feature" as const,
        htmlUrl: null,
        setupHref: item.setupHref ?? null,
        installed: active.feature.has(item.slug),
        uninstallBlockedBy: [],
      })),
    ];

    return NextResponse.json(
      {
        items: items.sort((left, right) =>
          `${left.kind}:${left.slug}`.localeCompare(
            `${right.kind}:${right.slug}`,
          ),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "store_catalog_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
