/**
 * @fileType utility
 * @domain kody
 * @pattern managed-goal-run-logs
 * @ai-summary Reads persisted managed-goal run JSONL logs from the configured
 *   Kody state repo and projects them into a compact UI timeline.
 */
import type { Octokit } from "@octokit/rest";

import { createServerTtlCache } from "@kody-ade/base/server-ttl-cache";
import { listStoredGoalRunEvents } from "./backend/agency-runs-store";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const RUN_LOGS_TTL_MS = 60_000;
const runLogsCache = createServerTtlCache<ManagedGoalRunLogsPayload>({
  ttlMs: RUN_LOGS_TTL_MS,
});

export interface ManagedGoalRunLogSummary {
  fileName: string;
  path: string;
  htmlUrl: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  triggerKind: string | null;
  eventName: string | null;
  actor: string | null;
  githubRunId: string | null;
  githubRunUrl: string | null;
  status: string | null;
  event: string | null;
  summary: string | null;
  capability: string | null;
  implementation: string | null;
  decisionKind: string | null;
  decisionReason: string | null;
  goalState: string | null;
  stage: string | null;
}

export interface ManagedGoalRunLogsPayload {
  goalId: string;
  runs: ManagedGoalRunLogSummary[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseJsonl(content: string): Record<string, unknown>[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return asRecord(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function firstString(
  records: readonly Record<string, unknown>[],
  pick: (record: Record<string, unknown>) => unknown,
): string | null {
  for (const record of records) {
    const value = stringValue(pick(record));
    if (value) return value;
  }
  return null;
}

function lastString(
  records: readonly Record<string, unknown>[],
  pick: (record: Record<string, unknown>) => unknown,
): string | null {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const value = stringValue(pick(records[index]!));
    if (value) return value;
  }
  return null;
}

function nestedString(
  record: Record<string, unknown>,
  key: string,
  nestedKey: string,
): string | null {
  return stringValue(asRecord(record[key])?.[nestedKey]);
}

export function summarizeManagedGoalRunLog(
  fileName: string,
  path: string,
  htmlUrl: string | null,
  content: string,
): ManagedGoalRunLogSummary {
  const records = parseJsonl(content);
  const first = records[0] ?? {};
  const last = records[records.length - 1] ?? first;
  const firstTrace = asRecord(first.trace);
  const lastTrace = asRecord(last.trace);
  const run = asRecord(first.run) ?? asRecord(last.run);
  const trigger = asRecord(first.trigger) ?? asRecord(last.trigger);
  const dispatch =
    asRecord(last.dispatch) ??
    asRecord(lastTrace?.capability) ??
    asRecord(firstTrace?.capability);
  const result = asRecord(lastTrace?.result);

  return {
    fileName,
    path,
    htmlUrl,
    startedAt: firstString(records, (record) => record.time),
    updatedAt: lastString(records, (record) => record.time),
    triggerKind:
      stringValue(trigger?.kind) ??
      stringValue(firstTrace?.triggerKind) ??
      stringValue(lastTrace?.triggerKind),
    eventName: stringValue(trigger?.eventName),
    actor: stringValue(trigger?.actor) ?? stringValue(trigger?.githubActor),
    githubRunId:
      stringValue(run?.githubRunId) ??
      stringValue(firstTrace?.workflowRunId) ??
      stringValue(lastTrace?.workflowRunId),
    githubRunUrl:
      stringValue(asRecord(first.links)?.workflowRun) ??
      stringValue(asRecord(last.links)?.workflowRun),
    status:
      stringValue(last.status) ??
      stringValue(result?.status) ??
      stringValue(lastTrace?.event),
    event: stringValue(last.event) ?? stringValue(lastTrace?.event),
    summary:
      stringValue(last.summary) ??
      stringValue(result?.summary) ??
      stringValue(last.reason) ??
      stringValue(lastTrace?.event),
    capability:
      stringValue(dispatch?.capability) ??
      stringValue(dispatch?.implementation) ??
      nestedString(last, "dispatchContext", "capability"),
    implementation: stringValue(dispatch?.implementation),
    decisionKind: nestedString(last, "decision", "kind"),
    decisionReason:
      nestedString(last, "decision", "reason") ?? stringValue(last.reason),
    goalState:
      stringValue(last.goalState) ?? nestedString(last, "goal", "state"),
    stage: stringValue(last.stage) ?? nestedString(last, "goal", "stage"),
  };
}

export async function listManagedGoalRunLogs({
  owner,
  repo,
  goalId,
  limit = DEFAULT_LIMIT,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  goalId: string;
  limit?: number;
}): Promise<ManagedGoalRunLogsPayload> {
  const boundedLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
  const cacheKey = `${owner}/${repo}:${goalId}:${boundedLimit}`;

  return runLogsCache.get(cacheKey, async () => {
    const events = await listStoredGoalRunEvents(
      owner,
      repo,
      goalId,
      boundedLimit * 100,
    );
    const byRun = new Map<string, typeof events>();
    for (const event of events) {
      const existing = byRun.get(event.runId) ?? [];
      existing.push(event);
      byRun.set(event.runId, existing);
    }
    const runs = [...byRun.entries()]
      .map(([runId, rows]) => {
        const content = rows
          .sort((a, b) => a.seq - b.seq)
          .map((row) => JSON.stringify(row.event))
          .join("\n");
        return summarizeManagedGoalRunLog(runId, runId, null, content);
      })
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, boundedLimit);

    return { goalId, runs };
  });
}
