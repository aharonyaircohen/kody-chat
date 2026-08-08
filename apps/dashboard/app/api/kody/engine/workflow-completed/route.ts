import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";
import { createUserOctokit } from "@kody-ade/base/github/core";
import { logger } from "@kody-ade/base/logger";
import type { SystemEventEnvelope } from "@kody-ade/base/events/types";
import {
  bearerToken,
  verifyGitHubWorkflowIdentity,
} from "@dashboard/lib/backend/github-actions-identity";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { dispatchWorkflowTriggers } from "@dashboard/features/workflows/server/github-workflow-trigger-dispatch";
import { deliverWorkflowInboxAlert } from "@dashboard/features/workflows/server/workflow-inbox-alert";
import { advancePipelineForWorkflowCompletion } from "@dashboard/features/pipelines/server/pipeline-orchestrator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(200),
    runId: z.string().trim().min(1).max(200),
    status: z.enum(["success", "failed", "blocked"]),
    summary: z.string().trim().min(1).max(1000).optional(),
    output: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "missing_workflow_identity" },
      { status: 401 },
    );
  }

  let identity: Awaited<ReturnType<typeof verifyGitHubWorkflowIdentity>>;
  try {
    identity = await verifyGitHubWorkflowIdentity(token);
  } catch {
    return NextResponse.json(
      { error: "invalid_workflow_identity" },
      { status: 401 },
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const [owner, repo, ...extra] = identity.repository.split("/");
  if (!owner || !repo || extra.length > 0) {
    return NextResponse.json(
      { error: "invalid_repository_identity" },
      { status: 400 },
    );
  }
  const background = await resolveBackgroundToken(owner, repo);
  if (!background) {
    return NextResponse.json(
      { error: "background_token_unavailable" },
      { status: 503 },
    );
  }

  const { workflowId, runId, status, summary, output } = parsed.data;
  const deliveryId = `kody-workflow:${workflowId}:${runId}`;
  const event: SystemEventEnvelope = {
    id: deliveryId,
    name: "kody.workflow.completed",
    version: 2,
    occurredAt: new Date().toISOString(),
    userId: null,
    sessionId: null,
    brand: { owner, repo },
    source: "server",
    payload: {
      ...output,
      workflowId,
      runId,
      status,
      ...(summary ? { summary } : {}),
      repository: identity.repository,
    },
  };

  setGitHubContext(owner, repo, background.token);
  try {
    const octokit = createUserOctokit(background.token);
    await advancePipelineForWorkflowCompletion({
      octokit,
      owner,
      repo,
      workflowRunId: runId,
      status,
      output,
    });
    await dispatchWorkflowTriggers({
      event,
      deliveryId,
      octokit,
    });
    if (status === "blocked") {
      try {
        await deliverWorkflowInboxAlert({
          owner,
          repo,
          workflowId,
          runId,
          summary: summary ?? "The workflow is blocked and needs attention.",
          url: new URL(
            `/repo/${owner}/${repo}/workflows/${workflowId}`,
            request.url,
          ).toString(),
          octokit,
        });
      } catch (error) {
        logger.warn(
          {
            event: "workflow_inbox_alert_failed",
            workflowId,
            runId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Workflow completed, but its Inbox alert could not be delivered",
        );
      }
    }
  } finally {
    clearGitHubContext();
  }

  return new NextResponse(null, { status: 204 });
}
