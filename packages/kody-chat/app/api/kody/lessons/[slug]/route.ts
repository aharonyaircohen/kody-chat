/**
 * @fileType api-endpoint
 * @domain lessons
 * @pattern state-repo-crud-api
 * @ai-summary Deletes one lesson by slug from `lessons/<slug>.json` in the
 *   Kody state repo. Admin only; audited.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { deleteLesson } from "@kody-ade/base/lessons";
import { recordAudit } from "@dashboard/lib/activity/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
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

  const { slug } = await context.params;
  const removed = await deleteLesson(octokit, auth.owner, auth.repo, slug);
  if (!removed) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  recordAudit(req, { action: "lesson.delete", resource: slug });
  return new NextResponse(null, { status: 204 });
}
