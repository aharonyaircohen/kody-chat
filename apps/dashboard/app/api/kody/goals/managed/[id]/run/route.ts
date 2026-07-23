/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern managed-goal-run
 * @ai-summary POST /api/kody/goals/managed/:id/run manually dispatches
 *   kody.yml for one managed goal.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

import {
  requireKodyAuth,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import {
  listStoredAgencyDefinitions,
  listStoredAgencyStates,
} from "@kody-ade/agency/backend/agency-model-store";
import {
  currentAgencyDefinition,
  currentAgencyState,
} from "@kody-ade/agency/agency-model-read";
import { recordAudit } from "@dashboard/lib/activity/audit";
import {
  setGitHubContext,
  clearGitHubContext,
} from "@dashboard/lib/github-client";
import { buildKodyWorkflowDispatchInputs } from "@dashboard/lib/kody-workflow-dispatch";

const goalIdPattern = /^[a-z][a-z0-9-]{0,127}$/;

function activeGoalResponse(goalId: string, ref: string) {
  return NextResponse.json({
    ok: true,
    workflowId: "kody.yml",
    ref,
    action: "goal-manager",
    goalId,
  });
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
  if (!goalIdPattern.test(id)) {
    return NextResponse.json({ error: "invalid_goal_id" }, { status: 400 });
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

  setGitHubContext(headerAuth.owner, headerAuth.repo, headerAuth.token);
  try {
    const [definitions, states] = await Promise.all([
      listStoredAgencyDefinitions(headerAuth.owner, headerAuth.repo),
      listStoredAgencyStates(headerAuth.owner, headerAuth.repo),
    ]);
    if (!currentAgencyDefinition(definitions, "goal", id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const state = currentAgencyState(states, "goal", id);
    if (state?.data.lifecycle !== "active") {
      return NextResponse.json({ error: "goal_not_active" }, { status: 409 });
    }

    const repoMeta = await octokit.rest.repos.get({
      owner: headerAuth.owner,
      repo: headerAuth.repo,
    });
    const ref = repoMeta.data.default_branch || "main";
    const inputs = await buildKodyWorkflowDispatchInputs(octokit, {
      owner: headerAuth.owner,
      repo: headerAuth.repo,
      ref,
      action: "goal-manager",
      message: id,
      storeRepoUrl: headerAuth.storeRepoUrl,
      storeRef: headerAuth.storeRef,
    });

    await octokit.rest.actions.createWorkflowDispatch({
      owner: headerAuth.owner,
      repo: headerAuth.repo,
      workflow_id: "kody.yml",
      ref,
      inputs,
    });

    recordAudit(req, {
      action: "goal.run",
      resource: id,
      detail: `manual workflow dispatch for goal ${id}`,
    });

    return activeGoalResponse(id, ref);
  } catch (err: any) {
    console.error("[managed-goals/run] dispatch failed", err);
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
