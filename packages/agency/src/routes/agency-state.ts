import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { clearGitHubContext, setGitHubContext } from "../github";
import { listAgencyState } from "../observation-store";
import type { AgencyStateModel } from "../observation-state";

function requestedModel(req: NextRequest): AgencyStateModel | null {
  const model = req.nextUrl.searchParams.get("model");
  return model === "observations" ||
    model === "findings" ||
    model === "learnings"
    ? model
    : null;
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;

  const model = requestedModel(req);
  if (!model) {
    return NextResponse.json({ error: "invalid_agency_state_model" }, { status: 400 });
  }
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  const octokit = await getUserOctokit(req);
  if (!octokit) {
    return NextResponse.json({ error: "no_user_token" }, { status: 401 });
  }

  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const payload = await listAgencyState({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      model,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "failed_to_read_agency_state",
        message: error instanceof Error ? error.message : "Failed to read agency state",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
