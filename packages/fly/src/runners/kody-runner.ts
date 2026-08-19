import type { NextRequest } from "next/server";

import { logger } from "@kody-ade/base/logger";
import {
  resolveServerContext,
} from "./server-run";
import { spawnRunner } from "../plugin/runners/fly";
import type { FlyContext } from "../plugin/runners/context";
import type { EngineExecutionRequest } from "@kody-ade/engine-contracts";

interface RepoMetadataOctokit {
  rest: {
    repos: {
      get(input: {
        owner: string;
        repo: string;
      }): Promise<{ data: { default_branch?: string | null } }>;
    };
  };
}

export type ScheduledKodyRunResult =
  | {
      ok: true;
      runner: "pool" | "fly";
      machineId: string;
      ref: string;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function runScheduledKodyOnRunner(
  req: NextRequest,
  opts: {
    taskId: string;
    runRequest: EngineExecutionRequest;
    dashboardUrl?: string;
  },
): Promise<ScheduledKodyRunResult> {
  const ctxResult = await resolveServerContext(req);
  if (!ctxResult.ok) {
    return {
      ok: false,
      error: ctxResult.error,
      status: ctxResult.status,
    };
  }

  const context = ctxResult.context as FlyContext;
  const { owner, repo } = context;
  const octokit = context.octokit as RepoMetadataOctokit;
  let ref = "main";
  try {
    const repoMeta = await octokit.rest.repos.get({ owner, repo });
    ref = repoMeta.data.default_branch || "main";
  } catch (err) {
    logger.warn(
      { err, owner, repo },
      "kody-runner: default-branch lookup failed; runner will use main",
    );
  }

  try {
    const run = await spawnRunner({
      repo: `${owner}/${repo}`,
      githubToken: context.githubToken,
      runRequest: opts.runRequest,
      dashboardUrl: opts.dashboardUrl,
      ref,
      allSecrets: context.allSecrets,
      flyToken: context.flyToken,
      perfTier: context.perfTier,
    });
    return { ok: true, runner: "fly", machineId: run.machineId, ref };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}
