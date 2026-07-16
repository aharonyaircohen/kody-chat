/**
 * @fileType utility
 * @domain user-state
 * @pattern user-state-adapter
 * @ai-summary Default user-state adapter (name kept as "state-repo" so
 *   existing namespace configs resolve unchanged), now backed by the Convex
 *   backend: userState.{get,save} keyed by tenantId ("owner/repo"),
 *   namespace, and userKey. TTL cache in front of reads; writes invalidate.
 *   Convex writes are last-write-wins, so expectedRevision is advisory only.
 */
import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { withEscapedKeys } from "@kody-ade/backend/client";
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
  expires: number;
}

const cache = new Map<string, CacheEntry>();

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_URL is not configured — user-state requires a Convex deployment URL",
    );
  }
  // Escaping wrapper: user-state `data` is an open payload — reserved-prefix
  // keys ($/_) are escaped on writes and unescaped on reads.
  client = withEscapedKeys(new ConvexHttpClient(url));
  return client;
}

/** Exported for unit tests — clears the doc cache and cached client. */
export function _resetUserStateDocCache(): void {
  cache.clear();
  client = null;
}

export function userStateFilePath(namespace: string, userId: string): string {
  return `user-state/${namespace}/${userFileKey(userId)}.json`;
}

function cacheKey(
  ctx: UserStateAdapterContext,
  namespace: string,
  userKey: string,
): string {
  return `user-state:${ctx.owner}/${ctx.repo}:${namespace}:${userKey}`;
}

interface UserStateBackendDoc {
  data: unknown;
  updatedAt: string;
}

export const stateRepoUserStateAdapter: UserStateAdapter = {
  name: "state-repo",

  async get(ctx, userId, namespace: UserStateNamespace) {
    const userKey = userFileKey(userId);
    const key = cacheKey(ctx, namespace.name, userKey);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.doc;
    }

    const record = (await getClient().query(anyApi.userState.get, {
      tenantId: `${ctx.owner}/${ctx.repo}`,
      namespace: namespace.name,
      userKey,
    })) as UserStateBackendDoc | null;

    const doc: UserStateDoc | null =
      record &&
      record.data &&
      typeof record.data === "object" &&
      !Array.isArray(record.data)
        ? {
            version: namespace.version,
            namespace: namespace.name,
            userId,
            updatedAt: record.updatedAt,
            data: record.data as Record<string, unknown>,
            revision: null,
          }
        : null;
    cache.set(key, { doc, expires: Date.now() + CACHE_TTL_MS });
    return doc;
  },

  async set(ctx, userId, namespace: UserStateNamespace, doc: UserStateDoc) {
    const userKey = userFileKey(userId);
    cache.delete(cacheKey(ctx, namespace.name, userKey));

    await getClient().mutation(anyApi.userState.save, {
      tenantId: `${ctx.owner}/${ctx.repo}`,
      namespace: namespace.name,
      userKey,
      data: doc.data,
      updatedAt: doc.updatedAt,
    });
  },
};
