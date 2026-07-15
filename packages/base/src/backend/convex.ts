/**
 * @fileType utility
 * @domain backend
 * @pattern convex-backend
 * @ai-summary Server-side Convex access shared by every package: cached
 *   ConvexHttpClient singleton from CONVEX_URL and the tenant-id convention
 *   ("owner/repo") every entity function is scoped by. Mirrors the
 *   dashboard's lib/backend/convex-backend.ts so package code never imports
 *   the host app.
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

let client: ConvexHttpClient | null = null;

/** Cached ConvexHttpClient built from CONVEX_URL. Throws when unset. */
export function getConvexClient(): ConvexHttpClient {
  if (client) return client;
  const url = process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_URL is not configured — the Kody backend requires a Convex deployment URL",
    );
  }
  client = new ConvexHttpClient(url);
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

/** Untyped function references (packages have no generated Convex api). */
export const backendApi = anyApi;
