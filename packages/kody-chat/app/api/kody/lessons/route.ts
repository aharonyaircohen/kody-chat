/**
 * @fileType api-endpoint
 * @domain lessons
 * @pattern state-repo-crud-api
 * @ai-summary Lists and upserts a brand's lessons (`lessons/<slug>.json` in
 *   the state repo). Admin (operator PAT) only; mutations are audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { listLessons, saveLesson, lessonConfigSchema } from "@kody-ade/base/lessons";
import { recordAudit } from "@dashboard/lib/activity/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const saveSchema = z.object({ lesson: lessonConfigSchema });

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
  const lessons = await listLessons(octokit, auth.owner, auth.repo, {
    cache: false,
  });
  return NextResponse.json({ lessons }, { headers: NO_STORE_HEADERS });
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

  let lesson: z.infer<typeof saveSchema>["lesson"];
  try {
    lesson = saveSchema.parse(await req.json()).lesson;
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_lesson", detail: String(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await saveLesson(octokit, auth.owner, auth.repo, lesson);
  recordAudit(req, {
    action: "lesson.save",
    resource: lesson.slug,
    detail: `${lesson.steps.length} steps`,
  });
  return NextResponse.json({ lesson }, { headers: NO_STORE_HEADERS });
}
