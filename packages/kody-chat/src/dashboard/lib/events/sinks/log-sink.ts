/**
 * @fileType utility
 * @domain events
 * @pattern system-event-sink
 * @ai-summary Durable sink: appends system events as JSONL to a day-sharded
 *   file (`events/log/YYYY-MM-DD.jsonl`) in the brand's state repo. Day
 *   sharding keeps files bounded without trim logic and lets analytics
 *   consume by date range. Writes are CAS (read sha → append → write with
 *   sha), retried on conflict. Best-effort: failures warn, never throw.
 */
import "server-only";
import type { Octokit } from "@octokit/rest";
import { resolveBackgroundToken } from "@dashboard/lib/auth/background-token";
import { createUserOctokit } from "@dashboard/lib/github-client";
import { logger } from "@dashboard/lib/logger";
import { readStateText, writeStateText } from "@dashboard/lib/state-repo";
import type { SystemEventEnvelope, SystemEventSink } from "../types";

const MAX_WRITE_ATTEMPTS = 3;

/**
 * Only low-volume, high-value events are durably persisted. High-frequency
 * UI telemetry (page views, view shown/clicked) stays on the in-memory /
 * pino path — one GitHub commit per event would hammer rate limits and
 * bloat the state repo. A proper analytics sink picks those up in a later
 * phase.
 */
const DURABLE_EVENT_NAMES = new Set([
  "session.started",
  "session.ended",
  "chat.message.sent",
  "chat.response.completed",
  "auth.signed_in",
  "auth.signed_out",
  "model.save.proposed",
  "state.entity.written",
  "system.error",
]);

export function eventLogPath(occurredAt: string): string {
  const day = occurredAt.slice(0, 10);
  return `events/log/${day}.jsonl`;
}

async function resolveOctokit(
  ctxOctokit: unknown | null,
  owner: string,
  repo: string,
): Promise<Octokit | null> {
  if (ctxOctokit) return ctxOctokit as Octokit;
  const bg = await resolveBackgroundToken(owner, repo);
  return bg ? createUserOctokit(bg.token) : null;
}

async function appendEvents(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  lines: string,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const existing = await readStateText(octokit, owner, repo, path).catch(
      (error: unknown) => {
        if ((error as { status?: number })?.status === 404) return null;
        throw error;
      },
    );
    const content = existing ? `${existing.content.trimEnd()}\n${lines}` : lines;
    try {
      await writeStateText({
        octokit,
        owner,
        repo,
        path,
        content: `${content}\n`,
        message: "chore(events): append system events",
        sha: existing?.sha,
      });
      return;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status !== 409 || attempt === MAX_WRITE_ATTEMPTS) throw error;
    }
  }
}

export const durableLogSink: SystemEventSink = {
  name: "durable-log",
  async handle(events, ctx) {
    const withBrand = events.filter(
      (event): event is SystemEventEnvelope & {
        brand: { owner: string; repo: string };
      } => event.brand !== null && DURABLE_EVENT_NAMES.has(event.name),
    );
    if (withBrand.length === 0) return;

    // Group by brand + day shard so each file is written once per batch.
    const groups = new Map<string, SystemEventEnvelope[]>();
    for (const event of withBrand) {
      const key = `${event.brand.owner}/${event.brand.repo}:${eventLogPath(event.occurredAt)}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    for (const [key, group] of groups) {
      const { owner, repo } = group[0].brand as {
        owner: string;
        repo: string;
      };
      const path = eventLogPath(group[0].occurredAt);
      try {
        const octokit = await resolveOctokit(ctx.octokit, owner, repo);
        if (!octokit) {
          logger.warn({ key }, "system-event durable sink: no token, skipped");
          continue;
        }
        const lines = group
          .map((event) => JSON.stringify(event))
          .join("\n");
        await appendEvents(octokit, owner, repo, path, lines);
      } catch (err) {
        logger.warn({ err, key }, "system-event durable sink failed");
      }
    }
  },
};
