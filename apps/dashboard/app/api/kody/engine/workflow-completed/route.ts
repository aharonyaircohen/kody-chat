import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";
import { createUserOctokit } from "@kody-ade/base/github/core";
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestSchema = z
  .object({
    workflowId: z.string().trim().min(1).max(200),
    runId: z.string().trim().min(1).max(200),
    status: z.enum(["success", "failed"]),
    output: z
      .object({
        pr: z.number().int().positive().optional(),
        headSha: z.string().trim().min(7).max(64).optional(),
      })
      .strict()
      .default({}),
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

  const { workflowId, runId, status, output } = parsed.data;
  const deliveryId = `kody-workflow:${workflowId}:${runId}`;
  const event: SystemEventEnvelope = {
    id: deliveryId,
    name: "kody.workflow.completed",
    version: 1,
    occurredAt: new Date().toISOString(),
    userId: null,
    sessionId: null,
    brand: { owner, repo },
    source: "server",
    payload: {
      workflowId,
      runId,
      status,
      repository: identity.repository,
      ...output,
    },
  };

  setGitHubContext(owner, repo, background.token);
  try {
    await dispatchWorkflowTriggers({
      event,
      deliveryId,
      octokit: createUserOctokit(background.token),
    });
  } finally {
    clearGitHubContext();
  }

  return new NextResponse(null, { status: 204 });
}
