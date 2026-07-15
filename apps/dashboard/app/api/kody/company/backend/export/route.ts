/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-backend-export-api
 * @ai-summary Exports the tenant's state-repo files as a DB-agnostic JSON
 *   dump keyed by backend table, using the shared mapStateFile mapping.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import {
  listStateDirectory,
  readStateText,
} from "@kody-ade/base/state-repo";
import { mapStateFile, STATE_ROOTS } from "@kody-ade/backend/export-mapping";
import type { Octokit } from "@octokit/rest";

// Derived from the entity registry (packages/kody-backend/src/entities.ts) —
// the single source of truth. Roots containing a dot are files, others dirs.
const STATE_DIRS = STATE_ROOTS.filter((root) => !root.includes("."));
const STATE_ROOT_FILES = STATE_ROOTS.filter((root) => root.includes("."));

export interface BackendExportDump {
  version: 1;
  exportedAt: string;
  tenantId: string;
  skipped: number;
  failures: string[];
  tables: Record<string, Array<Record<string, unknown>>>;
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

function mapGithubError(error: any, fallback: string, status = 500) {
  if (error?.status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  }
  if (error?.status === 403 || error?.message?.includes("rate limit")) {
    return NextResponse.json(
      { error: "rate_limited", message: "GitHub API rate limit exceeded" },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: fallback, message: error?.message ?? fallback },
    { status },
  );
}

async function walkStateFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  dirPath: string,
): Promise<string[]> {
  let entries;
  try {
    ({ entries } = await listStateDirectory(octokit, owner, repo, dirPath));
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${dirPath}/${entry.name}`;
      if (entry.type === "dir") {
        return walkStateFiles(octokit, owner, repo, relative);
      }
      return [relative];
    }),
  );
  return nested.flat();
}

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

    const { owner, repo } = headerAuth;
    const tenantId = `${owner}/${repo}`;
    const now = new Date().toISOString();

    const dirFiles = await Promise.all(
      STATE_DIRS.map((dir) => walkStateFiles(octokit, owner, repo, dir)),
    );
    const paths = [...STATE_ROOT_FILES, ...dirFiles.flat()];

    const tables = new Map<string, Array<Record<string, unknown>>>();
    let skipped = 0;
    const failures: string[] = [];

    for (const path of paths) {
      let file;
      try {
        file = await readStateText(octokit, owner, repo, path);
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      if (!file) continue;
      try {
        const rows = mapStateFile(path, file.content, tenantId, now);
        if (!rows) {
          skipped += 1;
          continue;
        }
        for (const row of rows) {
          const docs = tables.get(row.table) ?? [];
          tables.set(row.table, [...docs, row.doc]);
        }
      } catch {
        failures.push(path);
      }
    }

    const dump: BackendExportDump = {
      version: 1,
      exportedAt: now,
      tenantId,
      skipped,
      failures,
      tables: Object.fromEntries(tables),
    };

    const filename = `backend-export-${owner}-${repo}-${now.slice(0, 10)}.json`;
    return NextResponse.json(dump, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return mapGithubError(err, "failed_to_export_backend");
  } finally {
    clearGitHubContext();
  }
}
