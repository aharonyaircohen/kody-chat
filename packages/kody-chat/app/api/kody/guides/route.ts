/**
 * @fileType api-endpoint
 * @domain guides
 * @pattern state-repo-crud-api
 * @ai-summary Lists and upserts a brand's guides (`guides/<slug>.json` in
 *   the state repo). Admin (operator PAT) only; mutations are audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { listGuides, saveGuide, guideConfigSchema } from "@kody-ade/base/guides";
import { recordAudit } from "@dashboard/lib/activity/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const saveSchema = z.object({ guide: guideConfigSchema });

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
  const guides = await listGuides(octokit, auth.owner, auth.repo, {
    cache: false,
  });
  return NextResponse.json({ guides }, { headers: NO_STORE_HEADERS });
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

  let guide: z.infer<typeof saveSchema>["guide"];
  try {
    guide = saveSchema.parse(await req.json()).guide;
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_guide", detail: String(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  await saveGuide(octokit, auth.owner, auth.repo, guide);
  recordAudit(req, {
    action: "guide.save",
    resource: guide.slug,
    detail: `${guide.steps.length} steps`,
  });
  return NextResponse.json({ guide }, { headers: NO_STORE_HEADERS });
}
