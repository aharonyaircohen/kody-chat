/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern goals-api
 * @ai-summary Reorder goals — POST persists goal positions in Convex. Goals
 *   omitted from the payload retain their relative order.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireKodyAuth,
  verifyActorLogin,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { setGitHubContext, clearGitHubContext } from "../github";
import { getOwner, getRepo } from "../github";
import { listGoals, saveGoal, type StoredGoal } from "../backend/goals-state";

function mapGithubError(error: any, fallback: string, status = 500) {
  if (error?.status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  }
  if (error?.status === 403 || error?.message?.includes("rate limit")) {
    return NextResponse.json(
      { error: "rate_limited", message: "GitHub API rate limit exceeded" },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: fallback, message: error?.message ?? fallback },
    { status },
  );
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
  actorLogin: z.string().optional(),
});

type ReorderOutcome =
  | { ok: true; goals: StoredGoal[] }
  | { ok: false; reason: "not_found" };

export async function POST(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (headerAuth)
    setGitHubContext(headerAuth.owner, headerAuth.repo, headerAuth.token);

  try {
    const payload = await req.json();
    const parsed = reorderSchema.parse(payload);

    const actorResult = await verifyActorLogin(req, parsed.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;

    const owner = headerAuth?.owner ?? getOwner();
    const repo = headerAuth?.repo ?? getRepo();
    const current = await listGoals(owner, repo);
    if (current.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const byId = new Map(current.map((goal) => [goal.id, goal]));
    const ordered: StoredGoal[] = [];
    const seen = new Set<string>();
    for (const id of parsed.orderedIds) {
      const goal = byId.get(id);
      if (goal && !seen.has(id)) { ordered.push(goal); seen.add(id); }
    }
    for (const goal of current) if (!seen.has(goal.id)) ordered.push(goal);
    const now = new Date().toISOString();
    await Promise.all(ordered.map((goal, position) => saveGoal(owner, repo, { ...goal, position, updatedAt: now })));
    return NextResponse.json({ goals: ordered.map((goal, position) => ({ ...goal, position, updatedAt: now })) });
  } catch (error: any) {
    console.error("[Goals] Error reordering goals:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", details: error.issues },
        { status: 400 },
      );
    }
    return mapGithubError(error, "reorder_failed");
  } finally {
    clearGitHubContext();
  }
}
