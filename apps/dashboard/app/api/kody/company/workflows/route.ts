/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-workflows-api
 * @ai-summary Lists and creates validated workflow definitions in the
 *   configured Kody state repo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { getEngineConfig, type KodyConfig } from "@kody-ade/base/engine/config";
import {
  collapseManagedGoalRecordsForList,
  type ManagedGoalRecord,
} from "@dashboard/lib/managed-goals";
import { listManagedGoalFiles } from "@dashboard/lib/managed-goals-files";
import {
  buildWorkflowDefinition,
  slugifyWorkflowDefinitionId,
  validateWorkflowDefinition,
  workflowDefinitionPath,
} from "@dashboard/lib/workflow-definitions";
import {
  listCompanyStoreCapabilityWorkflowDefinitionFiles,
  listCompanyStoreWorkflowDefinitionFiles,
  listWorkflowDefinitionFiles,
  readWorkflowDefinitionFile,
  writeWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import { listLocalCapabilityFiles } from "@dashboard/lib/capabilities/files";

const workflowInputMappingSchema = z.object({ from: z.string().trim().min(1) });
const workflowTransitionSchema = z.object({
  to: z.string().trim().min(1).max(80),
  when: z.record(z.string(), z.unknown()).optional(),
  default: z.boolean().optional(),
  maxIterations: z.number().int().positive().optional(),
});
const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  capability: z.string().trim().min(1).max(80),
  inputs: z.record(z.string(), workflowInputMappingSchema).optional(),
  next: z.array(workflowTransitionSchema).optional(),
});

const workflowPayloadSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(160),
  capabilities: z.array(z.string().trim().min(1).max(80)).min(1),
  startAt: z.string().trim().min(1).max(80).optional(),
  steps: z.array(workflowStepSchema).min(1).optional(),
  runWithoutApproval: z.boolean().optional(),
  actorLogin: z.string().trim().optional(),
});

function mapGithubError(error: any, fallback: string, status = 500) {
  if (error?.status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  }
  if (error?.status === 403 || error?.message?.includes("rate limit")) {
    return NextResponse.json(
      { error: "rate_limited", message: "GitHub API rate limit exceeded" },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: fallback, message: error?.message ?? fallback },
    { status },
  );
}

function activeWorkflowSlugs(config: KodyConfig): string[] {
  return (config.company?.activeWorkflows ?? []).filter(
    (slug): slug is string =>
      typeof slug === "string" && slug.trim().length > 0,
  );
}

function activeCapabilitySlugs(config: KodyConfig): string[] {
  return (config.company?.activeCapabilities ?? []).filter(
    (slug): slug is string =>
      typeof slug === "string" && slug.trim().length > 0,
  );
}

function referencedWorkflowSlugs(goals: ManagedGoalRecord[]): string[] {
  const ids = new Set<string>();
  for (const goal of goals) {
    const id = goal.state.workflowRef?.id?.trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
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

    const localWorkflows = await listWorkflowDefinitionFiles(
      headerAuth.owner,
      headerAuth.repo,
    );
    const { config } = await getEngineConfig(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
    );
    const activeWorkflowIds = new Set(activeWorkflowSlugs(config));
    const activeCapabilityIds = new Set(activeCapabilitySlugs(config));
    const managedGoals = collapseManagedGoalRecordsForList(
      await listManagedGoalFiles(octokit, headerAuth.owner, headerAuth.repo),
    );
    const referencedWorkflowIds = new Set(
      referencedWorkflowSlugs(managedGoals),
    );
    const storeWorkflowIds = new Set([
      ...activeWorkflowIds,
      ...referencedWorkflowIds,
    ]);
    const localIds = new Set(localWorkflows.map((workflow) => workflow.id));
    const storeWorkflows =
      storeWorkflowIds.size > 0
        ? (await listCompanyStoreWorkflowDefinitionFiles(octokit)).filter(
            (workflow) =>
              storeWorkflowIds.has(workflow.id) && !localIds.has(workflow.id),
          )
        : [];
    const visibleIds = new Set([
      ...localIds,
      ...storeWorkflows.map((workflow) => workflow.id),
    ]);
    const storeCapabilityWorkflows =
      activeCapabilityIds.size > 0
        ? (
            await listCompanyStoreCapabilityWorkflowDefinitionFiles(
              octokit,
              activeCapabilityIds,
            )
          ).filter((workflow) => !visibleIds.has(workflow.id))
        : [];
    const workflows = [
      ...localWorkflows,
      ...storeWorkflows,
      ...storeCapabilityWorkflows,
    ].sort((a, b) => a.id.localeCompare(b.id));
    return NextResponse.json(
      { workflows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return mapGithubError(err, "failed_to_list_workflows");
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
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
    const payload = await req.json().catch(() => null);
    const parsed = workflowPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const actorResult = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;

    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const id =
      slugifyWorkflowDefinitionId(parsed.data.id ?? "") ||
      slugifyWorkflowDefinitionId(parsed.data.name);
    if (!id) {
      return NextResponse.json(
        { error: "invalid_workflow_id" },
        { status: 400 },
      );
    }
    workflowDefinitionPath(id);

    const existing = await readWorkflowDefinitionFile(
      id,
      headerAuth.owner,
      headerAuth.repo,
    );
    if (existing) {
      return NextResponse.json(
        {
          error: "workflow_exists",
          message: `Workflow "${id}" already exists.`,
        },
        { status: 409 },
      );
    }

    const workflow = buildWorkflowDefinition(parsed.data);
    if (workflow.capabilities.length === 0) {
      return NextResponse.json(
        {
          error: "invalid_body",
          message: "Workflow needs at least one capability.",
        },
        { status: 400 },
      );
    }
    const [localCapabilities, { config }] = await Promise.all([
      listLocalCapabilityFiles(),
      getEngineConfig(octokit, headerAuth.owner, headerAuth.repo),
    ]);
    const knownCapabilities = new Set([
      ...localCapabilities.map((capability) => capability.slug),
      ...activeCapabilitySlugs(config),
    ]);
    const validationIssues = validateWorkflowDefinition(workflow, {
      knownCapabilities,
    });
    if (validationIssues.length > 0) {
      return NextResponse.json(
        {
          error: "invalid_workflow",
          message: "Workflow is not safe to save.",
          issues: validationIssues,
        },
        { status: 400 },
      );
    }
    const path = workflowDefinitionPath(id);
    await writeWorkflowDefinitionFile({
      owner: headerAuth.owner,
      repo: headerAuth.repo,
      id,
      workflow,
    });

    return NextResponse.json({
      workflow: {
        id,
        path,
        workflow,
        updatedAt: workflow.updatedAt,
        source: "local",
        readOnly: false,
        runnable: true,
      },
    });
  } catch (err: any) {
    return mapGithubError(err, "failed_to_create_workflow");
  } finally {
    clearGitHubContext();
  }
}
