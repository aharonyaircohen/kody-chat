import type { NextRequest } from "next/server";

import { logger } from "@dashboard/lib/logger";
import { claimOrSpawnFly } from "./fly-run";
import { resolveFlyContext } from "./fly-context";
import type { KodyRunRequest } from "./run-request";

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
    runRequest: KodyRunRequest;
  },
): Promise<ScheduledKodyRunResult> {
  const ctxResult = await resolveFlyContext(req);
  if (!ctxResult.ok) {
    return {
      ok: false,
      error: ctxResult.error,
      status: ctxResult.status,
    };
  }

  const { owner, repo, octokit } = ctxResult.context;
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
    const run = await claimOrSpawnFly(ctxResult.context, {
      taskId: opts.taskId,
      runRequest: opts.runRequest,
      ref,
    });
    return { ok: true, runner: run.runner, machineId: run.machineId, ref };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: 500,
    };
  }
}
