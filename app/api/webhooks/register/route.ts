/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern github-webhook-registration
 *
 * POST /api/webhooks/register
 *
 * Explicit, manual webhook registration entry point. Login flow already
 * calls this automatically (see app/api/oauth/github/callback/route.ts);
 * this endpoint exists for re-running registration without re-logging-in,
 * targeting a different repo, or recovering from rotation of the secret.
 *
 * Body (optional): { owner?: string, repo?: string, events?: string[] }
 * Defaults to GITHUB_OWNER/GITHUB_REPO and the standard event set.
 *
 * Caller's PAT (from session) must have `admin:repo_hook` scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyKodySession } from "@dashboard/lib/auth/kody_session";
import { GITHUB_OWNER, GITHUB_REPO } from "@dashboard/lib/constants";
import { getPublicBaseUrl } from "@dashboard/lib/auth/oauth-url";
import { ensureWebhook } from "@dashboard/lib/webhooks/register";
import { logger } from "@dashboard/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.KODY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "KODY_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const session = await verifyKodySession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const token = session.ghToken;
  if (!token) {
    return NextResponse.json(
      { error: "session has no GitHub token; re-login" },
      { status: 401 },
    );
  }

  let body: { owner?: string; repo?: string; events?: string[] } = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = (await req.json().catch(() => ({}))) as typeof body;
    }
  } catch {
    body = {};
  }

  const owner = body.owner?.trim() || GITHUB_OWNER;
  const repo = body.repo?.trim() || GITHUB_REPO;
  const hookUrl = `${getPublicBaseUrl(req)}/api/webhooks/github`;

  const result = await ensureWebhook({
    token,
    owner,
    repo,
    hookUrl,
    secret,
    events: body.events,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, status: result.status },
      { status: result.status === 403 || result.status === 404 ? result.status : 502 },
    );
  }

  logger.info(
    {
      event: "webhook_registered",
      hookId: result.hookId,
      created: result.created,
      owner,
      repo,
      by: session.login,
    },
    "Webhook registered (manual endpoint)",
  );
  return NextResponse.json(
    { ok: true, hookId: result.hookId, created: result.created, url: hookUrl },
    { status: result.created ? 201 : 200 },
  );
}
