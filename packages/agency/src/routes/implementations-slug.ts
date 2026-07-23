import { NextRequest, NextResponse } from "next/server";

import { requireKodyAuth, getRequestAuth } from "@kody-ade/base/auth";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { readStoreImplementation } from "../implementations/files";
import { listStoredAgencyDefinitions } from "../backend/agency-model-store";
import { resolveCapabilityImplementations } from "../implementation-resolution";
import {
  clearGitHubContext,
  getOctokit,
  setGitHubContext,
} from "../github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const { slug } = await params;
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const octokit = getOctokit();
    const [implementation, engine, definitions] = await Promise.all([
      readStoreImplementation(octokit, slug),
      getEngineConfig(octokit, auth.owner, auth.repo, { force: true }),
      listStoredAgencyDefinitions(auth.owner, auth.repo),
    ]);
    if (!implementation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const repositoryBinding =
      engine.config.execution?.capabilityBindings?.[
        implementation.capabilityId
      ];
    const resolution = resolveCapabilityImplementations(
      definitions,
      implementation.capabilityId,
      repositoryBinding,
    );
    return NextResponse.json({
      implementation: {
        ...implementation,
        selected: resolution.selected?.data.id === implementation.id,
        selection:
          resolution.selected?.data.id === implementation.id
            ? repositoryBinding
              ? "repository"
              : "automatic"
            : "available",
        repositoryBinding: repositoryBinding ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "implementation_failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load implementation",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
