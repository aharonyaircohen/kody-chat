/**
 * @fileType utility
 * @domain kody
 * @pattern github-client
 * @ai-summary Pipeline status JSON access (branch/artifact), run-log artifacts, company activity log.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_TTL, TASK_ID_REGEX, ALL_STAGES } from "../constants";
import {
  parseActivityJsonl,
  sortActivityNewestFirst,
  type CompanyActivityRecord,
} from "../activity/company";
import {
  listStateDirectory,
  readStateText,
  stateRepoPath,
} from "../state-repo";
import { parseKodyRunLogZip, type KodyRunLogsRun } from "../activity/run-logs";
import type { KodyPipelineStatus, WorkflowRun } from "../types";
import { getCached, getStale, setCache, getOctokit, getOwner, getRepo } from "./core";
// ============ Status JSON Access ============

/**
 * Normalize pipeline status data from v2 format.
 * - Derives `currentStage` from stages data if not set (finds the running stage)
 * - Maps `cursor` field to `currentStage` as fallback
 */
export function normalizePipelineStatus(
  status: KodyPipelineStatus,
): KodyPipelineStatus {
  let currentStage = status.currentStage;

  // If currentStage is not set, derive it from stages data
  if (!currentStage && status.stages) {
    const stageEntries = Object.entries(status.stages);

    // 1. Find a stage that is currently running
    const runningEntry = stageEntries.find(
      ([, data]) => data.state === "running",
    );
    if (runningEntry) {
      currentStage = runningEntry[0];
    }

    // 2. Find a paused stage (pipeline gated)
    if (!currentStage) {
      const pausedEntry = stageEntries.find(
        ([, data]) => data.state === "paused",
      );
      if (pausedEntry) {
        currentStage = pausedEntry[0];
      }
    }

    // 3. Derive from stage completion: walk ALL_STAGES in order,
    //    find the first stage with data that is NOT completed/skipped (= where we are now).
    //    Stages without data entries are skipped (they may not be tracked).
    if (!currentStage) {
      for (const stage of ALL_STAGES) {
        const data = status.stages[stage];
        if (!data) continue; // Stage not tracked — skip
        if (data.state !== "completed" && data.state !== "skipped") {
          // This stage hasn't finished — it's the current position
          currentStage = stage;
          break;
        }
      }
    }

    // 4. If ALL known stages are completed/skipped, use the last completed stage
    if (!currentStage && stageEntries.length > 0) {
      let lastCompleted: string | null = null;
      for (const stage of ALL_STAGES) {
        const data = status.stages[stage];
        if (data && (data.state === "completed" || data.state === "skipped")) {
          lastCompleted = stage;
        }
      }
      if (lastCompleted) {
        currentStage = lastCompleted;
      }
    }
  }

  return {
    ...status,
    currentStage,
  };
}

/**
 * Read status.json from a branch.
 *
 * Caching: 60s TTL with ETag/`If-None-Match` revalidation. Polled per active
 * task on every /tasks tick — without 304 support, cache misses each cost a
 * full REST point. With ETag, unchanged status files revalidate for free.
 */
export async function getStatusFromBranch(
  taskId: string,
  branch: string,
): Promise<KodyPipelineStatus | null> {
  const cacheKey = `status:branch:${getOwner()}:${getRepo()}:${taskId}:${branch}`;
  const cached = getCached<KodyPipelineStatus>(cacheKey);
  if (cached) return cached;

  const stale = getStale<KodyPipelineStatus>(cacheKey);
  const octokit = getOctokit();

  try {
    const response = await octokit.repos.getContent({
      owner: getOwner(),
      repo: getRepo(),
      path: `.tasks/${taskId}/status.json`,
      ref: branch,
      headers: stale?.etag ? { "If-None-Match": stale.etag } : undefined,
    });

    const data = response.data;
    const newEtag = (response.headers as Record<string, string | undefined>)
      ?.etag;

    if ("content" in data && data.content) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const raw = JSON.parse(content) as KodyPipelineStatus;
      const status = normalizePipelineStatus(raw);
      setCache(cacheKey, CACHE_TTL.pipeline, status, { etag: newEtag });
      return status;
    }
  } catch (error: any) {
    // 304 Not Modified — file unchanged. Refresh TTL on stale data, no rate cost.
    if (error.status === 304 && stale) {
      setCache(cacheKey, CACHE_TTL.pipeline, stale.data, { etag: stale.etag });
      return stale.data;
    }
    if (error.status !== 404) {
      console.error("[Kody] Error fetching status from branch:", error);
    }
  }

  return null;
}

/**
 * Discover and read status.json from a branch by scanning the .tasks/ directory.
 * The pipeline creates task IDs with random counters (e.g., 260306-auto-330) that
 * don't match the issue number, so we can't guess the task ID from the issue.
 * Instead, we list .tasks/ on the branch and find the newest YYMMDD-prefixed directory.
 */
export async function findStatusOnBranch(
  branch: string,
  issueNumber?: number,
): Promise<KodyPipelineStatus | null> {
  // Cache the .tasks/ directory listing separately from the resolved status,
  // so the listing call can revalidate via ETag while different issueNumber
  // queries still get distinct resolved-status caching.
  const listingKey = `status:tasks-listing:${getOwner()}:${getRepo()}:${branch}`;
  const cacheKey = `status:discover:${getOwner()}:${getRepo()}:${branch}:${issueNumber ?? "any"}`;
  const cached = getCached<KodyPipelineStatus>(cacheKey);
  if (cached) return cached;

  const octokit = getOctokit();

  // Fetch (or revalidate) the .tasks/ listing with ETag/304.
  let taskDirs: string[] | null = getCached<string[]>(listingKey);
  if (!taskDirs) {
    const stale = getStale<string[]>(listingKey);
    try {
      const response = await octokit.repos.getContent({
        owner: getOwner(),
        repo: getRepo(),
        path: ".tasks",
        ref: branch,
        headers: stale?.etag ? { "If-None-Match": stale.etag } : undefined,
      });

      const data = response.data;
      const newEtag = (response.headers as Record<string, string | undefined>)
        ?.etag;

      if (Array.isArray(data)) {
        taskDirs = data
          .filter(
            (item: any) => item.type === "dir" && TASK_ID_REGEX.test(item.name),
          )
          .map((item: any) => item.name as string)
          .sort()
          .reverse(); // Newest first (YYMMDD sorts chronologically)
        setCache(listingKey, CACHE_TTL.pipeline, taskDirs, { etag: newEtag });
      }
    } catch (error: any) {
      // 304 Not Modified — directory unchanged. Reuse the stale listing.
      if (error.status === 304 && stale) {
        setCache(listingKey, CACHE_TTL.pipeline, stale.data, {
          etag: stale.etag,
        });
        taskDirs = stale.data;
      } else if (error.status !== 404) {
        console.error("[Kody] Error listing .tasks/ on branch:", error);
      }
    }
  }

  if (!taskDirs || taskDirs.length === 0) return null;

  // Try the newest task directory first (check up to 3).
  // When issueNumber is provided, skip status files belonging to different issues
  // (branches can accumulate status.json files from multiple pipeline runs).
  for (const taskDir of taskDirs.slice(0, 3)) {
    const status = await getStatusFromBranch(taskDir, branch);
    if (status) {
      if (
        issueNumber &&
        status.issueNumber &&
        status.issueNumber !== issueNumber
      )
        continue;
      setCache(cacheKey, CACHE_TTL.pipeline, status);
      return status;
    }
  }

  return null;
}

/**
 * Read `todos/<id>.json` from the configured Kody state repo with cache +
 * ETag/304 revalidation. Returns `null` when the file is missing (= the
 * engine has never ticked this goal) or unparseable.
 *
 * Uses the polling token (no per-user octokit) because the goals listing
 * route is hot — every poll fetches goals, and per-user reads would
 * multiply the rate-limit cost. The state file lives in the configured Kody state repo
 * branch (engine commits it there), so the polling token is sufficient.
 */
export async function fetchGoalStateFromRepo(goalId: string): Promise<{
  goalIssueNumber?: number;
  goalPrUrl?: string;
} | null> {
  if (!goalId || /[\\/]|\.\./.test(goalId)) return null;
  const path = `todos/${goalId}.json`;
  const cacheKey = `goal-state:${getOwner()}:${getRepo()}:${goalId}`;
  const cached = getCached<{
    goalIssueNumber?: number;
    goalPrUrl?: string;
  } | null>(cacheKey);
  if (cached !== null) return cached;

  const stale = getStale<{
    goalIssueNumber?: number;
    goalPrUrl?: string;
  } | null>(cacheKey);
  const octokit = getOctokit();

  try {
    const file = await readStateText(octokit, getOwner(), getRepo(), path, {
      headers: stale?.etag ? { "If-None-Match": stale.etag } : undefined,
    }).catch((error: any) => {
      if (error.status === 404) return null;
      throw error;
    });
    if (!file) {
      setCache(cacheKey, CACHE_TTL.tasks, null);
      return null;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(file.content) as Record<string, unknown>;
    } catch {
      setCache(cacheKey, CACHE_TTL.tasks, null, { etag: file.etag });
      return null;
    }
    const goalIssueNumber =
      typeof parsed.goalIssueNumber === "number"
        ? parsed.goalIssueNumber
        : undefined;
    const goalPrUrl =
      typeof parsed.goalPrUrl === "string" && parsed.goalPrUrl.length > 0
        ? parsed.goalPrUrl
        : undefined;
    const result = { goalIssueNumber, goalPrUrl };
    setCache(cacheKey, CACHE_TTL.tasks, result, { etag: file.etag });
    return result;
  } catch (error: any) {
    if (error.status === 304 && stale) {
      setCache(cacheKey, CACHE_TTL.tasks, stale.data, { etag: stale.etag });
      return stale.data;
    }
    if (error.status === 404) {
      setCache(cacheKey, CACHE_TTL.tasks, null);
      return null;
    }
    console.error(`[Kody] Error reading goal state for ${goalId}:`, error);
    return null;
  }
}

/**
 * Read status.json from an artifact
 */
export async function getStatusFromArtifact(
  taskId: string,
  runId: string,
): Promise<KodyPipelineStatus | null> {
  const cacheKey = `status:artifact:${getOwner()}:${getRepo()}:${taskId}:${runId}`;
  const cached = getCached<KodyPipelineStatus>(cacheKey);
  if (cached) return cached;

  const octokit = getOctokit();

  try {
    // Find artifact
    const { data: artifacts } = await octokit.actions.listWorkflowRunArtifacts({
      owner: getOwner(),
      repo: getRepo(),
      run_id: parseInt(runId),
    });

    const artifact = artifacts.artifacts.find(
      (a: { name: string }) => a.name === `kody-${taskId}-${runId}`,
    );

    if (!artifact) {
      return null;
    }

    // Download artifact
    await octokit.actions.downloadArtifact({
      owner: getOwner(),
      repo: getRepo(),
      artifact_id: artifact.id,
      archive_format: "zipball",
    });

    // Note: In a real implementation, we'd need to extract the zip and parse status.json
    // For now, return null as this requires additional handling
    console.log("[Kody] Artifact download not fully implemented");
    return null;
  } catch (error: any) {
    if (error.status !== 404) {
      console.error("[Kody] Error fetching status from artifact:", error);
    }
  }

  return null;
}

/**
 * Read Kody run events from the Actions artifact named
 * kody-run-logs-<run_id>-<run_attempt>.
 */
export async function fetchKodyRunLogArtifact(
  run: WorkflowRun,
): Promise<KodyRunLogsRun> {
  const runAttempt = run.run_attempt ?? 1;
  const artifactName = `kody-run-logs-${run.id}-${runAttempt}`;
  const base: KodyRunLogsRun = {
    runId: run.id,
    runAttempt,
    runNumber: run.run_number ?? null,
    title: run.display_title?.trim() || `Run ${run.id}`,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
    artifactName,
    artifactStatus: "missing",
    artifactUrl: null,
    message:
      "Run log artifact is missing or expired. Artifacts are retained for 30 days.",
    events: [],
    timeline: [],
    agencyBoundaryEvals: [],
  };

  const cacheKey = `run-log-artifact:${getOwner()}:${getRepo()}:${run.id}:${runAttempt}`;
  const cached = getCached<KodyRunLogsRun>(cacheKey);
  if (cached) return cached;

  const existing = inflightRunLogArtifacts.get(cacheKey);
  if (existing) return existing;

  const octokit = getOctokit();

  const promise = (async () => {
    try {
      const { data } = await octokit.actions.listWorkflowRunArtifacts({
        owner: getOwner(),
        repo: getRepo(),
        run_id: run.id,
        per_page: 100,
      });

      const artifact = data.artifacts.find((a) => a.name === artifactName);
      if (!artifact) {
        setCache(cacheKey, CACHE_TTL.pipeline, base);
        return base;
      }

      if (artifact.expired) {
        const expired = {
          ...base,
          artifactStatus: "expired" as const,
          artifactUrl: artifact.archive_download_url ?? null,
        };
        setCache(cacheKey, CACHE_TTL.pipeline, expired);
        return expired;
      }

      const response = await octokit.actions.downloadArtifact({
        owner: getOwner(),
        repo: getRepo(),
        artifact_id: artifact.id,
        archive_format: "zip",
      });
      const parsed = parseKodyRunLogZip(
        await artifactResponseToBuffer(response.data),
        run.id,
      );

      const result: KodyRunLogsRun = {
        ...base,
        artifactStatus: parsed ? "available" : "error",
        artifactUrl: artifact.archive_download_url ?? null,
        message: parsed
          ? null
          : "Run log artifact did not contain .kody/agent-runs/<runId>/events.jsonl.",
        events: parsed?.events ?? [],
        timeline: parsed?.timeline ?? [],
        agencyBoundaryEvals: parsed?.agencyBoundaryEvals ?? [],
      };
      setCache(cacheKey, CACHE_TTL.pipeline, result);
      return result;
    } catch (error: any) {
      if (error.status !== 404 && error.status !== 410) {
        console.warn("[Kody] Error fetching run log artifact:", error);
        const result = {
          ...base,
          artifactStatus: "error" as const,
          message:
            error?.message ??
            "Run log artifact could not be downloaded from GitHub Actions.",
          agencyBoundaryEvals: [],
        };
        setCache(cacheKey, CACHE_TTL.pipeline, result);
        return result;
      }
      setCache(cacheKey, CACHE_TTL.pipeline, base);
      return base;
    }
  })().finally(() => {
    inflightRunLogArtifacts.delete(cacheKey);
  });

  inflightRunLogArtifacts.set(cacheKey, promise);
  return promise;
}

const inflightRunLogArtifacts = new Map<string, Promise<KodyRunLogsRun>>();

async function artifactResponseToBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (
    data &&
    typeof data === "object" &&
    "arrayBuffer" in data &&
    typeof (data as Blob).arrayBuffer === "function"
  ) {
    return Buffer.from(await (data as Blob).arrayBuffer());
  }
  if (typeof data === "string") return Buffer.from(data, "binary");
  return Buffer.from([]);
}

/**
 * Read the engine-authored Company Activity log — recent
 * `activity/<date>.jsonl` files committed by `appendCompanyActivity`.
 * Lists the dir, reads the newest few day-files, parses + merges newest-first.
 * Each file is ETag/304-cached (rate-limit rule #2). Returns [] when the dir
 * doesn't exist yet (no engine ticks recorded).
 */
const ACTIVITY_DIR = "activity";
const ACTIVITY_DAY_FILES = 3;

export async function fetchCompanyActivity(
  limit = 100,
  dayFiles = ACTIVITY_DAY_FILES,
): Promise<CompanyActivityRecord[]> {
  const octokit = getOctokit();
  const owner = getOwner();
  const repo = getRepo();

  // List the activity dir (ETag-cached). 404 = nothing recorded yet.
  const listKey = `activity-dir:${owner}:${repo}`;
  const listStale = getStale<string[]>(listKey);
  let files: string[] = listStale?.data ?? [];
  try {
    const { entries, etag } = await listStateDirectory(
      octokit,
      owner,
      repo,
      ACTIVITY_DIR,
      {
        headers: listStale?.etag
          ? { "If-None-Match": listStale.etag }
          : undefined,
      },
    );
    files = entries
      .filter((e) => e.type === "file" && e.name.endsWith(".jsonl"))
      .map((e) => e.name);
    setCache(listKey, CACHE_TTL.tasks, files, { etag });
  } catch (error: unknown) {
    const status = (error as { status?: number })?.status;
    if (status === 304 && listStale) {
      setCache(listKey, CACHE_TTL.tasks, listStale.data, {
        etag: listStale.etag,
      });
      files = listStale.data;
    } else if (status === 404) {
      return [];
    } else if (!listStale) {
      return [];
    }
  }

  // Newest day-files first (filenames are YYYY-MM-DD.jsonl → lexicographic).
  const recent = [...files].sort().reverse().slice(0, dayFiles);

  const perFile = await Promise.all(
    recent.map(async (name) => {
      const path = `${ACTIVITY_DIR}/${name}`;
      const key = `activity-file:${owner}:${repo}:${name}`;
      const stale = getStale<CompanyActivityRecord[]>(key);
      try {
        const file = await readStateText(octokit, owner, repo, path, {
          headers: stale?.etag ? { "If-None-Match": stale.etag } : undefined,
        });
        if (file) {
          const recs = parseActivityJsonl(file.content);
          setCache(key, CACHE_TTL.tasks, recs, { etag: file.etag });
          return recs;
        }
      } catch (error: unknown) {
        const status = (error as { status?: number })?.status;
        if (status === 304 && stale) {
          setCache(key, CACHE_TTL.tasks, stale.data, { etag: stale.etag });
          return stale.data;
        }
        if (stale) return stale.data;
      }
      return [];
    }),
  );

  return sortActivityNewestFirst(perFile.flat()).slice(0, limit);
}
