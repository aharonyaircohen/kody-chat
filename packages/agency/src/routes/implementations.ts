import { NextRequest, NextResponse } from "next/server";

import { requireKodyAuth, getRequestAuth } from "@kody-ade/base/auth";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { listStoreImplementations } from "../implementations/files";
import { listStoredAgencyDefinitions } from "../backend/agency-model-store";
import { resolveCapabilityImplementations } from "../implementation-resolution";
import {
  clearGitHubContext,
  getOctokit,
  setGitHubContext,
} from "../github";

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const octokit = getOctokit();
    const [implementations, engine, definitions] = await Promise.all([
      listStoreImplementations(octokit),
      getEngineConfig(octokit, auth.owner, auth.repo, { force: true }),
      listStoredAgencyDefinitions(auth.owner, auth.repo),
    ]);
    const activeCapabilities = new Set(
      engine.config.company?.activeCapabilities ?? [],
    );
    const bindings = engine.config.execution?.capabilityBindings ?? {};
    const selected = new Map<string, "repository" | "automatic">();
    for (const capabilityId of activeCapabilities) {
      const binding = bindings[capabilityId];
      const resolution = resolveCapabilityImplementations(
        definitions,
        capabilityId,
        binding,
      );
      if (resolution.selected) {
        selected.set(
          resolution.selected.data.id,
          binding ? "repository" : "automatic",
        );
      }
    }
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 100))
      : 100;
    const cursor = req.nextUrl.searchParams.get("cursor");
    const start = cursor
      ? implementations.findIndex(
          (implementation) => implementation.id.localeCompare(cursor) > 0,
        )
      : 0;
    const page =
      start < 0 ? [] : implementations.slice(start, start + limit);
    const nextCursor =
      start >= 0 && start + page.length < implementations.length
        ? page.at(-1)?.id ?? null
        : null;
    return NextResponse.json({
      implementations: page.map((implementation) => {
        const selection = selected.get(implementation.id);
        return {
          ...implementation,
          selected: Boolean(selection),
          selection: selection ?? "available",
        };
      }),
      nextCursor,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "implementations_failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to list implementations",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
