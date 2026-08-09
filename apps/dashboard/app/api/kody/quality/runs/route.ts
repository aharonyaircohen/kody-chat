import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { GET as getQualityResource } from "@kody-ade/kody-chat-dashboard/routes/kody/quality";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { workflowRunAction } from "@kody-ade/agency/workflow-run-approval";
import { recordAudit } from "@dashboard/lib/activity/audit";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { createCompanyWorkflowLoader } from "@dashboard/features/workflows/server/company-workflow-loader";
import { createGitHubActionsEngineGateway } from "@dashboard/features/workflows/server/github-actions-engine-gateway";
import { startWorkflow } from "@dashboard/features/workflows/server/start-workflow";
import { workflowRequiresApproval } from "@dashboard/features/workflows/server/workflow-execution-authorization";
import {
  validateWorkflowDefinition,
  validateWorkflowInput,
} from "@dashboard/lib/workflow-definitions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return getQualityResource(req, {
    params: Promise.resolve({ resource: "runs" }),
  });
}

const inputSchema = z.object({
  scenarioSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  retryOfRunId: z.string().max(128).optional(),
});

type QualityMap = {
  journeys: Array<{ slug: string; updatedAt: string }>;
  scenarios: Array<{
    slug: string;
    journeySlug: string;
    status: "draft" | "active" | "archived";
    testId?: string;
    updatedAt: string;
  }>;
};

function environmentFor(
  url: URL,
): "local" | "preview" | "staging" | "production" {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    return "local";
  if (process.env.VERCEL_ENV === "production") return "production";
  if (url.hostname.endsWith(".vercel.app")) return "preview";
  return "staging";
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json(
      { error: "missing_repo_context" },
      { status: 400 },
    );

  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "validation_error" }, { status: 400 });

  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  const client = createBackendClient();
  const tenantId = `${auth.owner}/${auth.repo}`;
  const now = new Date().toISOString();
  const runId = `run-${randomUUID()}`;
  const runSlug = `${parsed.data.scenarioSlug}-${runId.slice(4, 12)}`;
  try {
    const octokit = await getUserOctokit(req);
    if (!octokit)
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    const actorResult = await verifyActorLogin(req, undefined);
    if (actorResult instanceof NextResponse) return actorResult;

    const map = (await client.query(backendApi.quality.getMap, {
      tenantId,
    })) as QualityMap;
    const scenario = map.scenarios.find(
      (candidate) => candidate.slug === parsed.data.scenarioSlug,
    );
    const journey = scenario
      ? map.journeys.find(
          (candidate) => candidate.slug === scenario.journeySlug,
        )
      : null;
    if (!scenario || !journey)
      return NextResponse.json(
        { error: "scenario_not_found" },
        { status: 404 },
      );
    if (scenario.status !== "active" || !scenario.testId) {
      return NextResponse.json(
        { error: "scenario_not_executable" },
        { status: 409 },
      );
    }

    const repository = await octokit.rest.repos.get({
      owner: auth.owner,
      repo: auth.repo,
    });
    const branch = repository.data.default_branch || "main";
    const commit = await octokit.rest.repos.getCommit({
      owner: auth.owner,
      repo: auth.repo,
      ref: branch,
    });
    const sourceCommit = commit.data.sha;
    const targetUrl = req.nextUrl.origin;
    const environment = environmentFor(req.nextUrl);

    await client.mutation(backendApi.quality.createRun, {
      tenantId,
      runId,
      runSlug,
      journeySlug: journey.slug,
      scenarioSlug: scenario.slug,
      environment,
      targetUrl,
      sourceCommit,
      definitionUpdatedAt: scenario.updatedAt,
      createdAt: now,
      ...(parsed.data.retryOfRunId
        ? { retryOfRunId: parsed.data.retryOfRunId }
        : {}),
    });

    const result = await startWorkflow(
      {
        workflowId: "quality-run",
        source: "dashboard",
        actor: `github:${actorResult.identity.githubId}`,
        requestId: runId,
        input: {
          qualityRunId: runId,
          scenarioSlug: scenario.slug,
          testId: scenario.testId,
          environment,
          targetUrl,
          sourceCommit,
        },
      },
      {
        createRequestId: () => runId,
        now: () => new Date().toISOString(),
        loadWorkflow: createCompanyWorkflowLoader({
          octokit,
          owner: auth.owner,
          repo: auth.repo,
        }),
        validateDefinition: validateWorkflowDefinition,
        validateInput: (schema, input) => validateWorkflowInput(input, schema),
        requiresApproval: workflowRequiresApproval,
        actionFor: workflowRunAction,
        consumeApproval: async () => false,
        dispatch: createGitHubActionsEngineGateway({
          octokit,
          owner: auth.owner,
          repo: auth.repo,
          dashboardUrl: targetUrl,
          storeRepoUrl: auth.storeRepoUrl,
          storeRef: auth.storeRef,
        }),
      },
    );

    if (result.kind !== "accepted") {
      const updatedAt = new Date().toISOString();
      await client.mutation(backendApi.quality.updateRun, {
        tenantId,
        runId,
        status: "blocked",
        updatedAt,
        finishedAt: updatedAt,
        error: `Quality workflow ${result.kind}`,
      });
      return NextResponse.json(
        { error: "quality_workflow_unavailable", runId },
        { status: 409 },
      );
    }

    await client.mutation(backendApi.quality.appendRunEvent, {
      tenantId,
      runId,
      idempotencyKey: "dashboard:dispatch-accepted",
      event: { type: "dispatch_accepted", requestId: result.requestId },
      time: result.acceptedAt,
    });
    await client.mutation(backendApi.quality.updateRun, {
      tenantId,
      runId,
      status: "running",
      updatedAt: result.acceptedAt,
      startedAt: result.acceptedAt,
    });
    recordAudit(req, {
      action: "quality.run",
      resource: scenario.slug,
      detail: `Quality Run ${runId}`,
    });
    return NextResponse.json(
      { runId, runSlug, status: "running", acceptedAt: result.acceptedAt },
      { status: 202 },
    );
  } catch (error) {
    const updatedAt = new Date().toISOString();
    await client
      .mutation(backendApi.quality.updateRun, {
        tenantId,
        runId,
        status: "blocked",
        updatedAt,
        finishedAt: updatedAt,
        error: "Quality Run dispatch failed",
      })
      .catch(() => undefined);
    console.error("[quality-runs] dispatch failed", { runId, error });
    return NextResponse.json(
      { error: "quality_run_dispatch_failed" },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
