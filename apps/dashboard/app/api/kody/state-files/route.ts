/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern state-file-view-api
 * @ai-summary GET /api/kody/state-files reads one runtime state file for
 *   Dashboard-owned evidence viewers.
 */
import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@dashboard/lib/auth";
import { normalizeStatePath, readStateText } from "@dashboard/lib/state-repo";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";

function parseRequestedPath(req: NextRequest): string | null {
  const raw = req.nextUrl.searchParams.get("path")?.trim();
  if (!raw) return null;
  return normalizeStatePath(raw, "state file path");
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  let path: string | null = null;
  try {
    path = parseRequestedPath(req);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "invalid_path",
        message:
          error instanceof Error ? error.message : "Invalid state file path",
      },
      { status: 400 },
    );
  }
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }

  const octokit = await getUserOctokit(req);
  if (!octokit) {
    return NextResponse.json({ error: "no_user_token" }, { status: 401 });
  }

  setGitHubContext(
    headerAuth.owner,
    headerAuth.repo,
    headerAuth.token,
    headerAuth.storeRepoUrl,
    headerAuth.storeRef,
  );

  try {
    const file = await readStateText(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
      path,
    );
    if (!file) {
      return NextResponse.json(
        { error: "state_file_not_found", path },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        requestedPath: path,
        path: file.path,
        content: file.content,
        sha: file.sha,
        htmlUrl: file.htmlUrl ?? null,
        size: file.size ?? file.content.length,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "failed_to_read_state_file",
        message:
          error instanceof Error ? error.message : "Failed to read state file",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
