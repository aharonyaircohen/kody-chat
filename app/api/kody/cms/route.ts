import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@dashboard/lib/auth";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { logger } from "@dashboard/lib/logger";
import { CmsConfigError, invalidateCmsConfigCache } from "@dashboard/lib/cms/config";
import {
  CmsRuntimeError,
  listCmsCollections,
} from "@dashboard/lib/cms/service";
import { readStateText, writeStateText } from "@dashboard/lib/state-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  setGitHubContext(
    headerAuth.owner,
    headerAuth.repo,
    headerAuth.token,
    headerAuth.storeRepoUrl,
    headerAuth.storeRef,
  );

  try {
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const cms = await listCmsCollections(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
    );
    return NextResponse.json({ cms }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleCmsError(error, "failed_to_load_cms");
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  setGitHubContext(
    headerAuth.owner,
    headerAuth.repo,
    headerAuth.token,
    headerAuth.storeRepoUrl,
    headerAuth.storeRef,
  );

  try {
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const name = readCmsName(payload, headerAuth.repo);
    const existing = await readStateText(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
      "cms/config.json",
    );
    if (existing) {
      return NextResponse.json(
        {
          error: "cms_already_configured",
          message: "CMS is already configured for this repo.",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const cms = {
      configured: true as const,
      version: 1 as const,
      name,
      environment: "default",
      writePolicy: "read-only" as const,
      collections: [],
    };

    await writeStateText({
      octokit,
      owner: headerAuth.owner,
      repo: headerAuth.repo,
      path: "cms/config.json",
      content: `${JSON.stringify(
        {
          version: 1,
          name,
          environment: "default",
          writePolicy: "read-only",
          collections: [],
        },
        null,
        2,
      )}\n`,
      message: "chore(cms): create CMS config",
    });
    invalidateCmsConfigCache(headerAuth.owner, headerAuth.repo);

    return NextResponse.json({ cms }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleCmsError(error, "failed_to_create_cms");
  } finally {
    clearGitHubContext();
  }
}

function readCmsName(payload: unknown, repo: string): string {
  const fallback = `${repo} CMS`;
  if (!payload || typeof payload !== "object" || !("name" in payload)) {
    return fallback;
  }
  const name = String((payload as { name?: unknown }).name ?? "").trim();
  if (!name) return fallback;
  if (name.length > 120) {
    throw new CmsRuntimeError("invalid_body", "name must be 120 characters or fewer", 400);
  }
  return name;
}

function handleCmsError(error: unknown, fallback: string): NextResponse {
  if (error instanceof CmsConfigError || error instanceof CmsRuntimeError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

  const status = (error as { status?: number } | null)?.status;
  if (status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  if (
    status === 403 ||
    String((error as Error)?.message ?? "").includes("rate limit")
  ) {
    return NextResponse.json(
      { error: "rate_limited", message: "GitHub API rate limit exceeded" },
      { status: 429, headers: NO_STORE_HEADERS },
    );
  }

  logger.error({ err: error }, "cms: request failed");
  return NextResponse.json(
    { error: fallback },
    { status: 500, headers: NO_STORE_HEADERS },
  );
}
