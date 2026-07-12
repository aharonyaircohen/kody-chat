/**
 * @fileType utility
 * @domain triggers
 * @pattern trigger-config
 * @ai-summary Loads and saves the brand's trigger rules from
 *   `triggers/config.json` in the state repo. Zod-validated with unknown
 *   event names and invalid entries dropped (warn), 60s TTL cache,
 *   CAS-safe writes. Same loader pattern as the user-state config.
 */
import "server-only";
import type { Octokit } from "@octokit/rest";
import { isSystemEventName } from "@kody-ade/base/events/catalog";
import { logger } from "@kody-ade/base/logger";
import { readStateText, writeStateText } from "@kody-ade/base/state-repo";
import {
  triggersFileSchema,
  type TriggerConfig,
  type TriggersFile,
} from "./types";

export const TRIGGERS_CONFIG_PATH = "triggers/config.json";

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  triggers: readonly TriggerConfig[];
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Exported for unit tests — clears the trigger config cache. */
export function _resetTriggersConfigCache(): void {
  cache.clear();
}

function cacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

export async function getTriggers(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<readonly TriggerConfig[]> {
  const key = cacheKey(owner, repo);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.triggers;

  let triggers: readonly TriggerConfig[] = [];
  try {
    const file = await readStateText(octokit, owner, repo, TRIGGERS_CONFIG_PATH);
    if (file) {
      const parsed = triggersFileSchema.parse(JSON.parse(file.content));
      triggers = parsed.triggers.filter((trigger) => {
        if (!isSystemEventName(trigger.event)) {
          logger.warn(
            { trigger: trigger.id, event: trigger.event, owner, repo },
            "triggers config: unknown event name — trigger ignored",
          );
          return false;
        }
        return true;
      });
    }
  } catch (error: unknown) {
    if ((error as { status?: number })?.status !== 404) {
      logger.warn({ err: error, owner, repo }, "triggers config load failed");
    }
  }

  cache.set(key, { triggers, expires: Date.now() + CACHE_TTL_MS });
  return triggers;
}

/** Overwrite the full triggers file (admin routes read-modify-write). */
export async function saveTriggers(
  octokit: Octokit,
  owner: string,
  repo: string,
  triggers: readonly TriggerConfig[],
): Promise<void> {
  const file: TriggersFile = { version: 1, triggers: [...triggers] };
  const content = JSON.stringify(file, null, 2);

  let sha: string | undefined;
  try {
    const existing = await readStateText(
      octokit,
      owner,
      repo,
      TRIGGERS_CONFIG_PATH,
    );
    sha = existing?.sha;
  } catch {
    // File may not exist yet.
  }

  await writeStateText({
    octokit,
    owner,
    repo,
    path: TRIGGERS_CONFIG_PATH,
    content: `${content}\n`,
    message: "feat(triggers): update trigger rules",
    sha,
  });
  cache.delete(cacheKey(owner, repo));
}
