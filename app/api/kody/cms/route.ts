import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@dashboard/lib/auth";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import { logger } from "@dashboard/lib/logger";
import {
  CmsConfigError,
  invalidateCmsConfigCache,
} from "@dashboard/lib/cms/config";
import {
  CmsRuntimeError,
  listCmsCollections,
} from "@dashboard/lib/cms/service";
import {
  CmsAdapterSetupError,
  getCmsSetupAdapter,
} from "@dashboard/lib/cms/adapters";
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
    const payload = await req.json().catch(() => null);
    const setupAdapter = getCmsSetupAdapter(readSetupAdapterName(payload));
    if (!setupAdapter) {
      return NextResponse.json(
        {
          error: "invalid_body",
          message: "Unsupported CMS adapter.",
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const setup = setupAdapter.create(payload);

    const actorResult = await verifyActorLogin(req, undefined);
    if (actorResult instanceof NextResponse) return actorResult;

    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const existingConfig = await readStateText(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
      "cms/config.json",
    );
    if (existingConfig) {
      return NextResponse.json(
        {
          error: "cms_already_configured",
          message: "CMS is already configured for this repo.",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    for (const file of setup.files) {
      await writeStateText({
        octokit,
        owner: headerAuth.owner,
        repo: headerAuth.repo,
        path: file.path,
        content: `${JSON.stringify(file.content, null, 2)}\n`,
        message: setup.commitMessage,
      });
    }

    invalidateCmsConfigCache(headerAuth.owner, headerAuth.repo);
    const cms = await listCmsCollections(
      octokit,
      headerAuth.owner,
      headerAuth.repo,
    );
    return NextResponse.json(
      { cms },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return handleCmsError(error, "failed_to_configure_cms");
  } finally {
    clearGitHubContext();
  }
}

function readSetupAdapterName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const adapter = (payload as { adapter?: unknown }).adapter;
  return typeof adapter === "string" && adapter.trim()
    ? adapter.trim()
    : undefined;
}

function handleCmsError(error: unknown, fallback: string): NextResponse {
  if (error instanceof CmsAdapterSetupError) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
      { status: error.status, headers: NO_STORE_HEADERS },
    );
  }

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
