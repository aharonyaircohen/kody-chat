/**
 * @fileType utility
 * @domain user-state
 * @pattern user-state-adapter
 * @ai-summary State-repo user-state adapter: one JSON file per user per
 *   namespace at `user-state/<namespace>/<userKey>.json` in the brand's
 *   kody-state repo. TTL cache + ETag/If-None-Match reads (free 304s) and
 *   CAS writes (sha → write; 409 conflicts propagate so the service can
 *   re-merge fresh data and retry).
 */
import "server-only";
import { readStateText, writeStateText } from "@dashboard/lib/state-repo";
import { userFileKey } from "../user-key";
import type {
  UserStateAdapter,
  UserStateAdapterContext,
  UserStateDoc,
  UserStateNamespace,
} from "../types";

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  doc: UserStateDoc | null;
  etag?: string;
  expires: number;
}

const cache = new Map<string, CacheEntry>();

/** Exported for unit tests — clears the doc cache. */
export function _resetUserStateDocCache(): void {
  cache.clear();
}

export function userStateFilePath(namespace: string, userId: string): string {
  return `user-state/${namespace}/${userFileKey(userId)}.json`;
}

function cacheKey(ctx: UserStateAdapterContext, path: string): string {
  return `user-state:${ctx.owner}/${ctx.repo}:${path}`;
}

function parseDoc(content: string): UserStateDoc | null {
  try {
    const parsed = JSON.parse(content) as UserStateDoc;
    return parsed && typeof parsed === "object" && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

export const stateRepoUserStateAdapter: UserStateAdapter = {
  name: "state-repo",

  async get(ctx, userId, namespace: UserStateNamespace) {
    const path = userStateFilePath(namespace.name, userId);
    const key = cacheKey(ctx, path);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now() && !cached.etag) {
      return cached.doc;
    }

    try {
      const file = await readStateText(ctx.octokit, ctx.owner, ctx.repo, path, {
        headers: cached?.etag
          ? { "If-None-Match": cached.etag }
          : undefined,
      });
      const doc = file ? parseDoc(file.content) : null;
      cache.set(key, {
        doc,
        etag: file?.etag,
        expires: Date.now() + CACHE_TTL_MS,
      });
      return doc;
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 304 && cached) {
        cache.set(key, { ...cached, expires: Date.now() + CACHE_TTL_MS });
        return cached.doc;
      }
      if (status === 404) {
        cache.set(key, { doc: null, expires: Date.now() + CACHE_TTL_MS });
        return null;
      }
      throw error;
    }
  },

  async set(ctx, userId, namespace: UserStateNamespace, doc: UserStateDoc) {
    const path = userStateFilePath(namespace.name, userId);
    const key = cacheKey(ctx, path);
    cache.delete(key);

    const content = JSON.stringify(doc, null, 2);
    const message = `feat(user-state): update ${namespace.name} state`;

    let sha: string | undefined;
    try {
      const file = await readStateText(ctx.octokit, ctx.owner, ctx.repo, path);
      sha = file?.sha;
    } catch {
      // File may not exist yet.
    }

    // No internal 409 retry: retrying with the same content would clobber
    // the concurrent write this doc was merged without. The service layer
    // re-reads, re-merges, and retries on conflict instead.
    await writeStateText({
      octokit: ctx.octokit,
      owner: ctx.owner,
      repo: ctx.repo,
      path,
      content,
      message,
      sha,
    });
  },
};
