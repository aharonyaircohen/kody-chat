/**
 * @fileType utility
 * @domain kody
 * @pattern github-client
 * @ai-summary Pipeline status JSON access (branch/artifact), run-log artifacts, company activity log.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CACHE_TTL, TASK_ID_REGEX, ALL_STAGES } from "@kody-ade/base/constants";
import {
  parseActivityJsonl,
  sortActivityNewestFirst,
  type CompanyActivityRecord,
} from "../activity/company";
import { parseKodyRunLogZip, type KodyRunLogsRun } from "../activity/run-logs";
import type { KodyPipelineStatus, WorkflowRun } from "@kody-ade/base/types";
import { getCached, getStale, setCache, getOctokit, getOwner, getRepo } from "@kody-ade/base/github/core";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@kody-ade/base/backend/convex";
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
 * Read the engine-authored Company Activity log from the Convex backend
 * (dailyLogs, stream "activity" — one row per former `activity/<date>.jsonl`
 * line). Newest-first, in-process cached (same TTL bucket as the old
 * ETag-cached GitHub reads) with a stale fallback on backend errors.
 * Returns [] when nothing is recorded yet. `dayFiles` is kept for signature
 * compatibility; on Convex the read is a single newest-first query.
 */
const ACTIVITY_DAY_FILES = 3;

export async function fetchCompanyActivity(
  limit = 100,
  _dayFiles = ACTIVITY_DAY_FILES,
): Promise<CompanyActivityRecord[]> {
  const owner = getOwner();
  const repo = getRepo();

  const key = `activity-recent:${owner}:${repo}:${limit}`;
  const stale = getStale<CompanyActivityRecord[]>(key);
  const fresh = getCached<CompanyActivityRecord[]>(key);
  if (fresh) return fresh;

  try {
    const rows = (await getConvexClient().query(backendApi.dailyLogs.recent, {
      tenantId: tenantIdFor(owner, repo),
      stream: "activity",
      limit,
    })) as Array<{ entry: unknown }>;
    const records = rows
      .map((row) => coerceActivityRecord(row.entry))
      .filter((rec): rec is CompanyActivityRecord => rec !== null);
    const sorted = sortActivityNewestFirst(records).slice(0, limit);
    setCache(key, CACHE_TTL.tasks, sorted);
    return sorted;
  } catch {
    if (stale) {
      setCache(key, CACHE_TTL.tasks, stale.data);
      return stale.data;
    }
    return [];
  }
}

/** One dailyLogs `entry` → CompanyActivityRecord (reuses the JSONL coercion). */
function coerceActivityRecord(entry: unknown): CompanyActivityRecord | null {
  try {
    const parsed = parseActivityJsonl(JSON.stringify(entry));
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}
