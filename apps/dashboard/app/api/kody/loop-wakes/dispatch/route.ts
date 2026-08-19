import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";

export const runtime = "nodejs";

const REPOSITORY = /^([^/\s]+)\/([^/\s]+)$/;

function validServiceKey(req: NextRequest): boolean {
  const expected = process.env.KODY_LOOP_WAKE_API_KEY?.trim() ?? "";
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

export async function POST(req: NextRequest) {
  if (!validServiceKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoMatch =
    typeof body.repo === "string" ? REPOSITORY.exec(body.repo) : null;
  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const runRequest = body.runRequest as Record<string, unknown> | undefined;
  const target = runRequest?.target as Record<string, unknown> | undefined;
  if (
    !repoMatch ||
    !jobId ||
    runRequest?.requestId !== jobId ||
    target?.type !== "workflow" ||
    target.id !== "scheduled-fanout" ||
    runRequest?.intent !== "tick" ||
    runRequest.source !== "schedule"
  ) {
    return NextResponse.json({ error: "Invalid loop wake" }, { status: 400 });
  }

  const backgroundToken = await resolveBackgroundToken(
    repoMatch[1],
    repoMatch[2],
  );
  if (!backgroundToken) {
    return NextResponse.json(
      { error: "Repository access is not configured" },
      { status: 503 },
    );
  }

  try {
    const octokit = new Octokit({ auth: backgroundToken.token });
    const repo = await octokit.rest.repos.get({
      owner: repoMatch[1],
      repo: repoMatch[2],
    });
    const ref = repo.data.default_branch;
    if (!ref) throw new Error("Repository has no default branch");
    await octokit.rest.actions.createWorkflowDispatch({
      owner: repoMatch[1],
      repo: repoMatch[2],
      workflow_id: "kody.yml",
      ref,
      inputs: { runRequest: JSON.stringify(runRequest) },
    });
  } catch {
    return NextResponse.json(
      { error: "GitHub workflow dispatch failed" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { ok: true, runner: "github-actions" },
    { status: 202 },
  );
}
