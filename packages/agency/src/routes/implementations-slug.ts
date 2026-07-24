import { NextRequest, NextResponse } from "next/server";

import {
  createCapabilityDefinition,
  type CapabilityDefinition,
} from "@kody-ade/agency-domain";
import { requireKodyAuth, getRequestAuth } from "@kody-ade/base/auth";
import {
  companyStoreAssetPath,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import {
  deleteStoreImplementation,
  readStoreImplementation,
  writeStoreImplementation,
} from "../implementations/files";
import { listStoredAgencyDefinitions } from "../backend/agency-model-store";
import { listStoredAgencyRuns } from "../backend/agency-runs-store";
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
    const [implementation, engine, definitions, runs] = await Promise.all([
      readStoreImplementation(octokit, slug),
      getEngineConfig(octokit, auth.owner, auth.repo, { force: true }),
      listStoredAgencyDefinitions(auth.owner, auth.repo),
      listStoredAgencyRuns(auth.owner, auth.repo, 100),
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
    const capabilityRoot = await companyStoreAssetPath(
      octokit,
      "capabilities",
      implementation.capabilityId,
    );
    const capabilityRaw = await readCompanyStoreText(
      octokit,
      `${capabilityRoot}/definition.json`,
    );
    let capabilityContract: CapabilityDefinition | null = null;
    if (capabilityRaw) {
      try {
        capabilityContract = createCapabilityDefinition(
          JSON.parse(capabilityRaw),
        );
      } catch {
        capabilityContract = null;
      }
    }
    const recentRuns = runs
      .filter((record) => {
        if (
          record.subjectType === "implementation" &&
          record.subjectId === implementation.id
        ) {
          return true;
        }
        const run =
          record.run &&
          typeof record.run === "object" &&
          !Array.isArray(record.run)
            ? (record.run as Record<string, unknown>)
            : {};
        const execution =
          run.execution &&
          typeof run.execution === "object" &&
          !Array.isArray(run.execution)
            ? (run.execution as Record<string, unknown>)
            : {};
        const implementationRef =
          execution.implementation &&
          typeof execution.implementation === "object" &&
          !Array.isArray(execution.implementation)
            ? (execution.implementation as Record<string, unknown>)
            : {};
        return implementationRef.id === implementation.id;
      })
      .slice(0, 5)
      .map((record) => {
        const run =
          record.run &&
          typeof record.run === "object" &&
          !Array.isArray(record.run)
            ? (record.run as Record<string, unknown>)
            : {};
        return {
          runId: record.runId,
          status:
            typeof run.status === "string" ? run.status : "unknown",
          updatedAt: record.updatedAt,
        };
      });
    return NextResponse.json({
      implementation: {
        ...implementation,
        capabilityContract,
        recentRuns,
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

export async function PATCH(
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
  setGitHubContext(auth.owner, auth.repo, auth.token, auth.storeRepoUrl, auth.storeRef);
  try {
    const existing = await readStoreImplementation(getOctokit(), slug);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const payload = await req.json();
    if (payload?.definition?.id !== slug) {
      return NextResponse.json(
        { error: "id_change_not_allowed", message: "Implementation id cannot be changed." },
        { status: 400 },
      );
    }
    const implementation = await writeStoreImplementation(getOctokit(), payload);
    return NextResponse.json({ implementation });
  } catch (error) {
    return NextResponse.json(
      {
        error: "implementation_update_failed",
        message: error instanceof Error ? error.message : "Failed to update implementation",
      },
      { status: 400 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function DELETE(
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
  setGitHubContext(auth.owner, auth.repo, auth.token, auth.storeRepoUrl, auth.storeRef);
  try {
    const existing = await readStoreImplementation(getOctokit(), slug);
    if (existing) {
      const [engine, definitions] = await Promise.all([
        getEngineConfig(getOctokit(), auth.owner, auth.repo, { force: true }),
        listStoredAgencyDefinitions(auth.owner, auth.repo),
      ]);
      const binding =
        engine.config.execution?.capabilityBindings?.[existing.capabilityId];
      const resolution = resolveCapabilityImplementations(
        definitions,
        existing.capabilityId,
        binding,
      );
      if (resolution.selected?.data.id === slug) {
        return NextResponse.json(
          {
            error: "implementation_in_use",
            message:
              "Remove this Implementation from the repository Capability before deleting it.",
          },
          { status: 409 },
        );
      }
    }
    const deleted = await deleteStoreImplementation(getOctokit(), slug);
    return NextResponse.json({ success: true, alreadyMissing: !deleted });
  } catch (error) {
    return NextResponse.json(
      {
        error: "implementation_delete_failed",
        message: error instanceof Error ? error.message : "Failed to delete implementation",
      },
      { status: 400 },
    );
  } finally {
    clearGitHubContext();
  }
}
