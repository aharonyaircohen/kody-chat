/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-workflow-run
 * @ai-summary Authenticated HTTP adapter for starting one Workflow through the
 * provider-neutral Kody Engine execution boundary.
 */
import { randomUUID } from "node:crypto";
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
import {
  isWorkflowDefinitionId,
  validateWorkflowDefinition,
} from "@dashboard/lib/workflow-definitions";
import { createCompanyWorkflowLoader } from "@dashboard/features/workflows/server/company-workflow-loader";
import { createGitHubActionsEngineGateway } from "@dashboard/features/workflows/server/github-actions-engine-gateway";
import { startWorkflow } from "@dashboard/features/workflows/server/start-workflow";
import { authorizeWorkflowExecution } from "@dashboard/features/workflows/server/workflow-execution-authorization";

const RUN_ID = /^run-[a-zA-Z0-9_-]{1,123}$/;

async function runOptions(
  req: NextRequest,
): Promise<{ requestId?: string; approved: boolean }> {
  try {
    const body = await req.json();
    return {
      ...(body?.mode === "resume" &&
      typeof body.runId === "string" &&
      RUN_ID.test(body.runId)
        ? { requestId: body.runId }
        : {}),
      approved: body?.approved === true,
    };
  } catch {
    return { approved: false };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;

  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  const { id } = await params;
  if (!isWorkflowDefinitionId(id)) {
    return NextResponse.json({ error: "invalid_workflow_id" }, { status: 400 });
  }

  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json(
        {
          error: "no_user_token",
          message: "A signed-in GitHub token is required to run a workflow.",
        },
        { status: 401 },
      );
    }
    const options = await runOptions(req);
    const result = await startWorkflow(
      {
        workflowId: id,
        source: "dashboard",
        requestId: options.requestId,
        approved: options.approved,
      },
      {
        createRequestId: () => `run-${randomUUID()}`,
        loadWorkflow: createCompanyWorkflowLoader({
          octokit,
          owner: auth.owner,
          repo: auth.repo,
        }),
        validateWorkflow: validateWorkflowDefinition,
        authorize: authorizeWorkflowExecution,
        dispatch: createGitHubActionsEngineGateway({
          octokit,
          owner: auth.owner,
          repo: auth.repo,
        }),
      },
    );

    if (result.kind === "not-found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        {
          error: "invalid_workflow",
          message: "Workflow is invalid and was not dispatched.",
          issues: result.issues,
        },
        { status: 409 },
      );
    }
    if (result.kind === "approval-required") {
      return NextResponse.json(
        {
          error: "approval_required",
          message: "This workflow requires explicit approval before it runs.",
        },
        { status: 409 },
      );
    }

    recordAudit(req, {
      action: "workflow.run",
      resource: id,
      detail: `manual Engine dispatch for workflow ${id}`,
    });
    return NextResponse.json(
      {
        ok: true,
        execution: "kody-engine",
        workflow: id,
        runId: result.requestId,
        acceptedAt: result.acceptedAt,
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[company-workflows/run] dispatch failed", error);
    return NextResponse.json(
      {
        error: "dispatch_failed",
        message:
          error instanceof Error ? error.message : "Failed to dispatch workflow",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
