/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern action-state
 *
 * GET /api/kody/action/state/:runId
 * Dashboard fetches the current state of an action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getActionState } from "@dashboard/lib/kody-store/action-state";
import { requireKodyAuth, getUserOctokit, getRequestAuth } from "@dashboard/lib/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  const { runId } = await params;

  const headerAuth = getRequestAuth(req);
  const owner = headerAuth?.owner ?? process.env.GITHUB_OWNER ?? "aharonyaircohen";
  const repo = headerAuth?.repo ?? process.env.GITHUB_REPO ?? "Kody-Dashboard";
  const octokit = await getUserOctokit(req);

  const state = await getActionState(runId, { owner, repo, octokit });

  if (!state) return NextResponse.json({ error: "Action not found" }, { status: 404 });

  return NextResponse.json({ state });
}
