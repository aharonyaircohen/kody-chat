/**
 * @fileType utility
 * @domain backend
 * @pattern convex-backend
 * @ai-summary Server-side Convex access for the dashboard: cached
 *   ConvexHttpClient singleton from CONVEX_URL and the tenant-id convention
 *   ("owner/repo") every entity function is scoped by.
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { withEscapedKeys } from "@kody-ade/backend/client";

let client: ConvexHttpClient | null = null;

/**
 * Cached ConvexHttpClient built from CONVEX_URL. Throws when unset.
 * Wrapped with withEscapedKeys: Convex reserves `$`/`_`-prefixed object keys,
 * so open payloads (view renderer nodes, chat turns, user state…) are
 * key-escaped on every write and unescaped on every read — callers always
 * see the original keys.
 */
export function getConvexClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_URL is not configured — the dashboard backend requires a Convex deployment URL",
    );
  }
  client = withEscapedKeys(new ConvexHttpClient(url));
  return client;
}

/** Exported for unit tests — clears the cached client. */
export function _resetConvexClient(): void {
  client = null;
}

/** Tenant scope for every Convex entity call. */
export function tenantIdFor(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/** Untyped function references (the dashboard has no generated Convex api). */
export const backendApi = anyApi;
