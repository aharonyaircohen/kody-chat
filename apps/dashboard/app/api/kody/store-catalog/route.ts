/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern store-catalog-api
 * @ai-summary Read-only catalog for the simple Agency assets.
 */

import { NextRequest, NextResponse } from "next/server";

import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import {
  buildCompanyStoreHtmlUrl,
  buildCompanyStoreBlobUrl,
} from "@kody-ade/base/company-store/assets";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { readCompanyStoreWorkflowDefinitionFile } from "@dashboard/lib/workflow-definition-files";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { BUILTIN_FEATURES } from "@dashboard/lib/features/catalog";
import { listStoreCatalogSlugs } from "@dashboard/lib/store-catalog-index";
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

function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
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
    const [localLoops, engine] = await Promise.all([
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
    const {
      capabilities,
      agents,
      commands,
      workflows: workflowSlugs,
      loops,
    } = await listStoreCatalogSlugs(octokit);
    const activeWorkflows = (
      await Promise.all(
        workflowSlugs
          .filter((slug) => active.workflow.has(slug))
          .map((slug) =>
            readCompanyStoreWorkflowDefinitionFile(slug, octokit),
          ),
      )
    ).filter((workflow) => workflow !== null);

    const workflowBlockers = (agent: string) =>
      activeWorkflows
        .filter(
          (item) =>
            item.workflow.agent === agent,
        )
        .map((item) => ({
          kind: "workflow" as const,
          slug: item.id,
          title: item.workflow.name || item.id,
        }));

    const items: CatalogItem[] = [
      ...capabilities.map((slug) => ({
        slug,
        title: titleFromSlug(slug),
        description: `Capability folder: ${slug}`,
        kind: "capability" as const,
        htmlUrl: buildCompanyStoreHtmlUrl("capabilities", slug),
        installed: active.capability.has(slug),
        uninstallBlockedBy: [],
      })),
      ...agents.map((slug) => ({
        slug,
        title: titleFromSlug(slug),
        description: `Agent: ${slug}`,
        kind: "agent" as const,
        htmlUrl: buildCompanyStoreBlobUrl(`agents/${slug}.md`),
        installed: active.agent.has(slug),
        uninstallBlockedBy: workflowBlockers(slug),
      })),
      ...commands.map((slug) => ({
        slug,
        title: `/${slug}`,
        description: `Command: /${slug}`,
        kind: "command" as const,
        htmlUrl: buildCompanyStoreBlobUrl(`commands/${slug}.md`),
        installed: active.command.has(slug),
        uninstallBlockedBy: [],
      })),
      ...workflowSlugs.map((slug) => ({
        slug,
        title: titleFromSlug(slug),
        description: `Workflow: ${slug}`,
        kind: "workflow" as const,
        htmlUrl: buildCompanyStoreHtmlUrl("workflows", slug),
        installed: active.workflow.has(slug),
        uninstallBlockedBy: [],
      })),
      ...loops.map((slug) => ({
        slug,
        title: titleFromSlug(slug),
        description: `Loop: ${slug}`,
        kind: "loop" as const,
        htmlUrl: buildCompanyStoreHtmlUrl("loops", slug),
        installed: active.loop.has(slug),
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
