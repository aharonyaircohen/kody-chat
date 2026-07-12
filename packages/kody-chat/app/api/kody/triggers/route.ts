/**
 * @fileType api-endpoint
 * @domain triggers
 * @pattern state-repo-crud-api
 * @ai-summary Lists and upserts the brand's trigger rules stored at
 *   `triggers/config.json` in the Kody state repo. Admin (operator PAT)
 *   only; mutations are audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { isSystemEventName } from "@kody-ade/base/events";
import {
  getTriggers,
  mutateTriggers,
  triggerConfigSchema,
} from "@kody-ade/base/triggers";
import { recordAudit } from "@dashboard/lib/activity/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const saveSchema = z.object({ trigger: triggerConfigSchema });

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json(
      { error: "missing_repo_context" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  // Read fresh: the admin API and the trigger sink run in separate server
  // bundles with independent module caches, so a cached list here can lag a
  // write made through the (separately-bundled) POST route.
  const triggers = await getTriggers(octokit, auth.owner, auth.repo, {
    cache: false,
  });
  return NextResponse.json({ triggers }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json(
      { error: "missing_repo_context" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let trigger: z.infer<typeof saveSchema>["trigger"];
  try {
    trigger = saveSchema.parse(await req.json()).trigger;
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_trigger", detail: String(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isSystemEventName(trigger.event)) {
    return NextResponse.json(
      { error: "unknown_event", detail: trigger.event },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await mutateTriggers(octokit, auth.owner, auth.repo, (existing) => [
    ...existing.filter((candidate) => candidate.id !== trigger.id),
    trigger,
  ]);
  recordAudit(req, {
    action: "trigger.save",
    resource: trigger.id,
    detail: `${trigger.event} → ${trigger.action.namespace}`,
  });
  return NextResponse.json({ trigger }, { headers: NO_STORE_HEADERS });
}
