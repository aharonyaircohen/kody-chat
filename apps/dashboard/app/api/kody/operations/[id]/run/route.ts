/** @fileType api-endpoint @domain agency-operations @pattern operation-run-api */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  listStoredAgencyDefinitions,
  listStoredAgencyStates,
} from "@kody-ade/agency/backend/agency-model-store";
import { operationReadiness } from "@kody-ade/agency/agency-model-read";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { recordAudit } from "@dashboard/lib/activity/audit";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { buildKodyWorkflowDispatchInputs } from "@dashboard/lib/kody-workflow-dispatch";
const runSchema = z.object({ actorLogin: z.string().trim().optional() });
const operationIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;
  if (!operationIdSchema.safeParse(id).success)
    return NextResponse.json(
      { error: "invalid_operation_id" },
      { status: 400 },
    );
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const parsed = runSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 },
      );
    const actor = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actor instanceof NextResponse) return actor;
    const octokit = await getUserOctokit(req);
    if (!octokit)
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    const [definitions, states] = await Promise.all([
      listStoredAgencyDefinitions(auth.owner, auth.repo),
      listStoredAgencyStates(auth.owner, auth.repo),
    ]);
    const readiness = operationReadiness(definitions, states, id);
    if (!readiness.operation)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (readiness.issues.includes("Operation is not active")) {
      return NextResponse.json(
        { error: "operation_not_active" },
        { status: 409 },
      );
    }
    const issues = readiness.issues;
    if (issues.length > 0) {
      return NextResponse.json(
        { error: "operation_not_ready", issues },
        { status: 409 },
      );
    }
    const repoMeta = await octokit.rest.repos.get({
      owner: auth.owner,
      repo: auth.repo,
    });
    const ref = repoMeta.data.default_branch || "main";
    const message = [
      `Operate Operation ${id}.`,
      "Load its authoritative definition and state from the Agency model.",
      `Act only on Goals [${readiness.goals.join(", ")}] and Loops [${readiness.loops.join(", ")}].`,
      "The linked Intent policy and Operation exclusions are mandatory.",
    ].join(" ");
    const inputs = await buildKodyWorkflowDispatchInputs(octokit, {
      owner: auth.owner,
      repo: auth.repo,
      ref,
      action: "agency-operations-management",
      message,
    });
    await octokit.rest.actions.createWorkflowDispatch({
      owner: auth.owner,
      repo: auth.repo,
      workflow_id: "kody.yml",
      ref,
      inputs,
    });
    recordAudit(req, {
      action: "operation.run",
      resource: id,
      detail: `manual workflow dispatch for Operation ${id}`,
    });
    return NextResponse.json({
      ok: true,
      workflowId: "kody.yml",
      ref,
      action: "agency-operations-management",
      operationId: id,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "dispatch_failed",
        message: error?.message ?? "Failed to dispatch Operation",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
