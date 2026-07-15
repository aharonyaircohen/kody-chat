/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-backend-export-api
 * @ai-summary Exports the tenant's state-repo files as a DB-agnostic JSON
 *   dump keyed by backend table, using the shared mapStateFile mapping. The
 *   whole state repo is fetched as ONE tarball download instead of per-file
 *   REST reads (rate-limit rules in apps/dashboard/CLAUDE.md).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { gunzipSync } from "node:zlib";

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
import { resolveStateRepo } from "@kody-ade/base/state-repo";
import { parseTarEntries } from "@dashboard/lib/tar-archive";
import { mapStateFile } from "@kody-ade/backend/export-mapping";

export interface BackendExportDump {
  version: 1;
  exportedAt: string;
  tenantId: string;
  skipped: number;
  failures: string[];
  tables: Record<string, Array<Record<string, unknown>>>;
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

/**
 * GitHub tarballs wrap everything in a `<owner>-<repo>-<sha>/` directory —
 * strip that first segment to get state-repo paths.
 */
function stripArchiveRoot(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "" : path.slice(slash + 1);
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

    // One API call for the entire state repo instead of one REST read per
    // file — the per-file walk drained the shared 5000/hr token budget.
    const target = await resolveStateRepo(octokit, owner, repo);
    const archive = await octokit.rest.repos.downloadTarballArchive({
      owner: target.owner,
      repo: target.repo,
      ref: target.branch,
    });
    const files = parseTarEntries(
      gunzipSync(Buffer.from(archive.data as ArrayBuffer)),
    );

    // Tenant files live under `<basePath>/…` in the state repo.
    const prefix = target.basePath ? `${target.basePath}/` : "";

    const tables = new Map<string, Array<Record<string, unknown>>>();
    let skipped = 0;
    const failures: string[] = [];

    for (const file of files) {
      const repoPath = stripArchiveRoot(file.path);
      if (!repoPath || !repoPath.startsWith(prefix)) continue;
      const statePath = repoPath.slice(prefix.length);
      if (!statePath) continue;
      try {
        const rows = mapStateFile(
          statePath,
          file.content.toString("utf8"),
          tenantId,
          now,
        );
        if (!rows) {
          skipped += 1;
          continue;
        }
        for (const row of rows) {
          const docs = tables.get(row.table) ?? [];
          tables.set(row.table, [...docs, row.doc]);
        }
      } catch {
        failures.push(statePath);
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
