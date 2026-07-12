/**
 * @fileType utility
 * @domain lessons
 * @pattern lesson-store
 * @ai-summary Loads and atomically mutates a brand's lessons from
 *   `lessons/<slug>.json` in the state repo (one file per lesson). Zod-
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
import { lessonConfigSchema, type LessonConfig } from "./types";

export const LESSONS_DIR = "lessons";

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  lessons: readonly LessonConfig[];
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Exported for unit tests — clears the lessons list cache. */
export function _resetLessonsCache(): void {
  cache.clear();
}

function cacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function lessonPath(slug: string): string {
  return `${LESSONS_DIR}/${slug}.json`;
}

interface LessonRead {
  lesson: LessonConfig;
  sha: string | undefined;
}

export async function getLesson(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
): Promise<LessonRead | null> {
  try {
    const file = await readStateText(octokit, owner, repo, lessonPath(slug));
    if (!file) return null;
    return {
      lesson: lessonConfigSchema.parse(JSON.parse(file.content)),
      sha: file.sha,
    };
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) return null;
    logger.warn({ err: error, owner, repo, slug }, "lesson load failed");
    return null;
  }
}

export async function listLessons(
  octokit: Octokit,
  owner: string,
  repo: string,
  options: { cache?: boolean } = {},
): Promise<readonly LessonConfig[]> {
  const key = cacheKey(owner, repo);
  const useCache = options.cache !== false;
  const cached = useCache ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) return cached.lessons;

  let lessons: LessonConfig[] = [];
  try {
    const { entries } = await listStateDirectory(octokit, owner, repo, LESSONS_DIR);
    const files = entries.filter(
      (entry) => entry.type === "file" && entry.name.endsWith(".json"),
    );
    const loaded = await Promise.all(
      files.map((entry) =>
        getLesson(octokit, owner, repo, entry.name.replace(/\.json$/, "")),
      ),
    );
    lessons = loaded
      .filter((result): result is LessonRead => result !== null)
      .map((result) => result.lesson);
  } catch (error: unknown) {
    if ((error as { status?: number })?.status !== 404) {
      logger.warn({ err: error, owner, repo }, "lessons list failed");
    }
  }

  cache.set(key, { lessons, expires: Date.now() + CACHE_TTL_MS });
  return lessons;
}

/** Create or replace one lesson (CAS on the file's own sha). */
export async function saveLesson(
  octokit: Octokit,
  owner: string,
  repo: string,
  lesson: LessonConfig,
): Promise<LessonConfig> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
    const existing = await getLesson(octokit, owner, repo, lesson.slug);
    try {
      await writeStateText({
        octokit,
        owner,
        repo,
        path: lessonPath(lesson.slug),
        content: `${JSON.stringify(lesson, null, 2)}\n`,
        message: `feat(lessons): update ${lesson.slug}`,
        sha: existing?.sha,
        maxAttempts: 1,
      });
      cache.delete(cacheKey(owner, repo));
      return lesson;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const conflict = status === 409 || status === 422;
      if (!conflict || attempt === MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error("lesson write retry exhausted");
}

export async function deleteLesson(
  octokit: Octokit,
  owner: string,
  repo: string,
  slug: string,
): Promise<boolean> {
  const existing = await getLesson(octokit, owner, repo, slug);
  if (!existing?.sha) return false;
  await deleteStateFile({
    octokit,
    owner,
    repo,
    path: lessonPath(slug),
    sha: existing.sha,
    message: `chore(lessons): delete ${slug}`,
  });
  cache.delete(cacheKey(owner, repo));
  return true;
}
