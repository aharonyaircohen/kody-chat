/**
 * @fileType utility
 * @domain guides
 * @pattern guide-store
 * @ai-summary Loads and atomically mutates a brand's guides from
 *   `guides/<slug>.json` in the state repo (one file per guide). Zod-
 *   validated, 60s TTL list cache, CAS read-modify-write per file — the
 *   same conventions as triggers/snippets. (Storage moves behind the
 *   user-state adapter seam in the final migration phase.)
 */
import "server-only";
import type { Octokit } from "@octokit/rest";
import { logger } from "@kody-ade/base/logger";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "@kody-ade/base/state-repo";
import { guideConfigSchema, type GuideConfig } from "./types";

export const GUIDES_DIR = "guides";

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  guides: readonly GuideConfig[];
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Exported for unit tests — clears the guides list cache. */
export function _resetGuidesCache(): void {
  cache.clear();
}

function cacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function guidePath(slug: string): string {
  return `${GUIDES_DIR}/${slug}.json`;
}

interface GuideRead {
  guide: GuideConfig;
  sha: string | undefined;
}

export async function getGuide(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
): Promise<GuideRead | null> {
  try {
    const file = await readStateText(octokit, owner, repo, guidePath(slug));
    if (!file) return null;
    return {
      guide: guideConfigSchema.parse(JSON.parse(file.content)),
      sha: file.sha,
    };
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) return null;
    logger.warn({ err: error, owner, repo, slug }, "guide load failed");
    return null;
  }
}

export async function listGuides(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: { cache?: boolean } = {},
): Promise<readonly GuideConfig[]> {
  const key = cacheKey(owner, repo);
  const useCache = options.cache !== false;
  const cached = useCache ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.guides;

  let guides: GuideConfig[] = [];
  try {
    const { entries } = await listStateDirectory(octokit, owner, repo, GUIDES_DIR);
    const files = entries.filter(
      (entry) => entry.type === "file" && entry.name.endsWith(".json"),
    );
    const loaded = await Promise.all(
      files.map((entry) =>
        getGuide(octokit, owner, repo, entry.name.replace(/\.json$/, "")),
      ),
    );
    guides = loaded
      .filter((result): result is GuideRead => result !== null)
      .map((result) => result.guide);
  } catch (error: unknown) {
    if ((error as { status?: number })?.status !== 404) {
      logger.warn({ err: error, owner, repo }, "guides list failed");
    }
  }

  cache.set(key, { guides, expires: Date.now() + CACHE_TTL_MS });
  return guides;
}

/** Create or replace one guide (CAS on the file's own sha). */
export async function saveGuide(
  octokit: Octokit,
  owner: string,
  repo: string,
  guide: GuideConfig,
): Promise<GuideConfig> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
    const existing = await getGuide(octokit, owner, repo, guide.slug);
    try {
      await writeStateText({
        octokit,
        owner,
        repo,
        path: guidePath(guide.slug),
        content: `${JSON.stringify(guide, null, 2)}\n`,
        message: `feat(guides): update ${guide.slug}`,
        sha: existing?.sha,
        maxAttempts: 1,
      });
      cache.delete(cacheKey(owner, repo));
      return guide;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const conflict = status === 409 || status === 422;
      if (!conflict || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("guide write retry exhausted");
}

export async function deleteGuide(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
): Promise<boolean> {
  const existing = await getGuide(octokit, owner, repo, slug);
  if (!existing?.sha) return false;
  await deleteStateFile({
    octokit,
    owner,
    repo,
    path: guidePath(slug),
    sha: existing.sha,
    message: `chore(guides): delete ${slug}`,
  });
  cache.delete(cacheKey(owner, repo));
  return true;
}
