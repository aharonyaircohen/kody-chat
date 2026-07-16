/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-workflow-run
 * @ai-summary POST /api/kody/company/workflows/:id/run manually dispatches
 *   kody.yml for one runnable workflow-capability.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { recordAudit } from "@dashboard/lib/activity/audit";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { runScheduledKodyOnRunner } from "@kody-ade/fly/runners/kody-runner";
import {
  workflowRunRequest,
  withStoreTarget,
} from "@kody-ade/fly/runners/run-request";
import {
  isWorkflowDefinitionId,
  validateWorkflowDefinition,
} from "@dashboard/lib/workflow-definitions";
import {
  readCompanyStoreCapabilityWorkflowDefinitionFile,
  readCompanyStoreWorkflowDefinitionFile,
  readWorkflowDefinitionFile,
} from "@dashboard/lib/workflow-definition-files";
import { recordWorkflowRunRunner } from "@dashboard/lib/workflow-run-state-files";

function activeStringSet(values: string[] | undefined): Set<string> {
  return new Set(
    (values ?? []).filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    ),
  );
}

function workflowNotRunnableResponse() {
  return NextResponse.json(
    {
      error: "workflow_not_runnable",
      message:
        "Only capability-backed Store workflows can be run immediately right now.",
    },
    { status: 409 },
  );
}

function newWorkflowRunId(): string {
  return `run-${Date.now().toString(36)}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  const { id } = await params;
  if (!isWorkflowDefinitionId(id)) {
    return NextResponse.json({ error: "invalid_workflow_id" }, { status: 400 });
  }

  setGitHubContext(
    headerAuth.owner,
    headerAuth.repo,
    headerAuth.token,
    headerAuth.storeRepoUrl,
    headerAuth.storeRef,
  );
  try {
    let requestedRunId: string | undefined;
    try {
      const body = await req.json();
      if (body?.mode === "resume" && typeof body.runId === "string") requestedRunId = body.runId;
    } catch {
      // Empty request body is the normal new-run path.
    }
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json(
        {
          error: "no_user_token",
          message: "A signed-in GitHub token is required to dispatch workflow.",
        },
        { status: 401 },
      );
    }

    const { config } = await getEngineConfig(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
      { force: true },
    );
    const activeCapabilities = activeStringSet(
      config.company?.activeCapabilities,
    );
    const activeWorkflows = activeStringSet(config.company?.activeWorkflows);

    let workflow = null;
    if (activeCapabilities.has(id)) {
      workflow = await readCompanyStoreCapabilityWorkflowDefinitionFile(
        id,
        octokit,
      );
      if (!workflow || workflow.runnable !== true) {
        return workflowNotRunnableResponse();
      }
    } else {
      workflow = await readWorkflowDefinitionFile(
        id,
        octokit,
        headerAuth.owner,
        headerAuth.repo,
      );
      if (!workflow && activeWorkflows.has(id)) {
        workflow = await readCompanyStoreWorkflowDefinitionFile(id, octokit);
      }
    }
    if (!workflow) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const validationIssues = validateWorkflowDefinition(workflow.workflow);
    if (validationIssues.length > 0) {
      return NextResponse.json(
        {
          error: "invalid_workflow",
          message: "Workflow is invalid and was not dispatched.",
          issues: validationIssues,
        },
        { status: 409 },
      );
    }

    const runId = requestedRunId && /^run-[a-z0-9]+$/.test(requestedRunId)
      ? requestedRunId
      : newWorkflowRunId();
    const run = await runScheduledKodyOnRunner(req, {
      taskId: `company-workflow-${id}-${runId}`,
      runRequest: withStoreTarget(workflowRunRequest(id, runId), headerAuth),
    });
    if (!run.ok) {
      return NextResponse.json(
        {
          error: "runner_failed",
          message: run.error,
        },
        { status: run.status },
      );
    }
    try {
      await recordWorkflowRunRunner(
        headerAuth.owner,
        headerAuth.repo,
        id,
        runId,
        { kind: run.runner, machineId: run.machineId },
      );
    } catch (trackingError) {
      console.warn("[company-workflows/run] runner tracking unavailable", trackingError);
    }

    recordAudit(req, {
      action: "workflow.run",
      resource: id,
      detail: `manual runner dispatch for workflow ${id}`,
    });

    return NextResponse.json({
      ok: true,
      runner: run.runner,
      machineId: run.machineId,
      ref: run.ref,
      workflow: id,
      runId,
      action: id,
    });
  } catch (err: any) {
    console.error("[company-workflows/run] dispatch failed", err);
    return NextResponse.json(
      {
        error: "dispatch_failed",
        message: err?.message ?? "Failed to dispatch workflow",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
