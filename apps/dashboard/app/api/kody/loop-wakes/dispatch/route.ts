import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { runScheduledKodyOnRunner } from "@kody-ade/fly/runners/kody-runner";
import { getInstallationToken } from "@kody-ade/base/auth/app-token";

export const runtime = "nodejs";

const REPOSITORY = /^([^/\s]+)\/([^/\s]+)$/;

function validServiceKey(req: NextRequest): boolean {
  const expected = process.env.KODY_LOOP_WAKE_API_KEY?.trim() ?? "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
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

  const repoMatch = typeof body.repo === "string" ? REPOSITORY.exec(body.repo) : null;
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

  const githubToken = await getInstallationToken(repoMatch[1], repoMatch[2]);
  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub App is not installed for this repository" },
      { status: 503 },
    );
  }

  const runnerRequest = new NextRequest(req.url, {
    headers: {
      "x-kody-token": githubToken,
      "x-kody-owner": repoMatch[1],
      "x-kody-repo": repoMatch[2],
    },
  });
  const result = await runScheduledKodyOnRunner(runnerRequest, {
    taskId: jobId,
    runRequest: runRequest as never,
    dashboardUrl: req.nextUrl.origin,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Runner start failed" }, { status: result.status });
  }
  return NextResponse.json(
    { ok: true, runner: result.runner, machineId: result.machineId },
    { status: 202 },
  );
}
