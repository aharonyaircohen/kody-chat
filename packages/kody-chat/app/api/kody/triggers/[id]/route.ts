/**
 * @fileType api-endpoint
 * @domain triggers
 * @pattern state-repo-crud-api
 * @ai-summary Deletes one trigger rule by id from `triggers/config.json`
 *   in the Kody state repo. Admin only; audited.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { getTriggers, saveTriggers } from "@kody-ade/base/triggers";
import { recordAudit } from "@dashboard/lib/activity/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const existing = await getTriggers(octokit, auth.owner, auth.repo, {
    cache: false,
  });
  const next = existing.filter((trigger) => trigger.id !== id);
  if (next.length === existing.length) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  await saveTriggers(octokit, auth.owner, auth.repo, next);
  recordAudit(req, { action: "trigger.delete", resource: id });
  return new NextResponse(null, { status: 204 });
}
