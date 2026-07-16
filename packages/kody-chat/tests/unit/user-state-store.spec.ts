/**
 * Unit tests for the state-repo user-state adapter and user file keys
 * (src/dashboard/lib/user-state/adapters/state-repo.ts, user-key.ts):
 * per-user Convex reads, cache hits on repeat reads, writes invalidating
 * the cache.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import { getFunctionName } from "convex/server";

const h = vi.hoisted(() => ({
  convexQuery: vi.fn(),
  convexMutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = h.convexQuery;
    mutation = h.convexMutation;
  },
}));

import { userFileKey } from "@dashboard/lib/user-state/user-key";
import {
  stateRepoUserStateAdapter,
  userStateFilePath,
  _resetUserStateDocCache,
} from "@dashboard/lib/user-state/adapters/state-repo";
import { CORE_USER_STATE_NAMESPACES } from "@dashboard/lib/user-state/namespaces/core";
import type { UserStateDoc } from "@dashboard/lib/user-state/types";

const ctx = { octokit: {} as Octokit, owner: "acme", repo: "shop" };
const selections = CORE_USER_STATE_NAMESPACES.find(
  (ns) => ns.name === "selections",
)!;
const USER = "client:jane@example.com";

function doc(data: Record<string, unknown>): UserStateDoc {
  return {
    version: 1,
    namespace: "selections",
    userId: USER,
    updatedAt: "2026-07-11T00:00:00.000Z",
    data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetUserStateDocCache();
  // Backend requires a URL to construct the cached client; the mock
  // ConvexHttpClient ignores it.
  process.env.CONVEX_URL = "https://test.convex.cloud";
});

describe("userFileKey", () => {
  it("sanitizes and appends a stable hash suffix", () => {
    const key = userFileKey(USER);
    expect(key).toMatch(/^client-jane-example-com-[0-9a-f]{8}$/);
    expect(userFileKey(USER)).toBe(key);
  });

  it("distinct ids that sanitize identically never collide", () => {
    expect(userFileKey("client:a.b@x.io")).not.toBe(userFileKey("client:a-b@x.io"));
  });
});

describe("stateRepoUserStateAdapter.get", () => {
  it("reads the per-user per-namespace path via Convex", async () => {
    h.convexQuery.mockResolvedValue({
      data: { theme: "dark" },
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    const result = await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(result?.data).toEqual({ theme: "dark" });
    const [ref, args] = h.convexQuery.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("userState:get");
    expect(args).toMatchObject({
      tenantId: "acme/shop",
      namespace: "selections",
      userKey: userFileKey(USER),
    });
    // Helper path is unchanged (kept for backwards-compatible diagnostics).
    expect(userStateFilePath("selections", USER)).toBe(
      `user-state/selections/${userFileKey(USER)}.json`,
    );
  });

  it("returns null when no record exists (Convex null)", async () => {
    h.convexQuery.mockResolvedValue(null);
    expect(
      await stateRepoUserStateAdapter.get(ctx, USER, selections),
    ).toBeNull();
  });

  it("propagates a backend error instead of swallowing it", async () => {
    h.convexQuery.mockRejectedValue(new Error("network"));
    await expect(
      stateRepoUserStateAdapter.get(ctx, USER, selections),
    ).rejects.toThrow("network");
  });

  it("serves the cached doc on a subsequent call (no extra query)", async () => {
    h.convexQuery.mockResolvedValueOnce({
      data: { theme: "dark" },
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(h.convexQuery).toHaveBeenCalledTimes(1);

    const second = await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(second?.data).toEqual({ theme: "dark" });
    expect(h.convexQuery).toHaveBeenCalledTimes(1);
  });
});

describe("stateRepoUserStateAdapter.set", () => {
  it("writes the doc data via Convex mutation and invalidates the read cache", async () => {
    h.convexQuery.mockResolvedValue({
      data: { theme: "dark" },
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    // Pre-populate the read cache so we can prove set() invalidates it.
    await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(h.convexQuery).toHaveBeenCalledTimes(1);

    h.convexMutation.mockResolvedValue("id-1");
    await stateRepoUserStateAdapter.set(
      ctx,
      USER,
      selections,
      doc({ a: "1" }),
    );

    expect(h.convexMutation).toHaveBeenCalledTimes(1);
    const [ref, args] = h.convexMutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("userState:save");
    expect(args).toMatchObject({
      tenantId: "acme/shop",
      namespace: "selections",
      userKey: userFileKey(USER),
      data: { a: "1" },
    });

    // The next read must re-fetch — the cache entry was dropped by set().
    h.convexQuery.mockResolvedValueOnce({
      data: { a: "1" },
      updatedAt: "2026-07-11T00:01:00.000Z",
    });
    await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(h.convexQuery).toHaveBeenCalledTimes(2);
  });

  it("propagates a mutation error instead of swallowing it", async () => {
    h.convexQuery.mockResolvedValue({
      data: { theme: "dark" },
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
    await stateRepoUserStateAdapter.get(ctx, USER, selections);

    h.convexMutation.mockRejectedValue({ status: 409 });
    await expect(
      stateRepoUserStateAdapter.set(ctx, USER, selections, doc({ a: "1" })),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.convexMutation).toHaveBeenCalledTimes(1);
  });

  it("writes without re-reading the current doc", async () => {
    h.convexMutation.mockResolvedValue("id-1");
    await stateRepoUserStateAdapter.set(
      ctx,
      USER,
      selections,
      doc({ a: "1" }),
    );
    // The adapter's write path is last-write-wins; it never needs to read
    // for CAS metadata. Any pre-read belongs to the service CAS loop, not
    // the adapter.
    expect(h.convexQuery).not.toHaveBeenCalled();
    expect(h.convexMutation).toHaveBeenCalledTimes(1);
  });

  it("create-only write goes through the same mutation and stamps updatedAt", async () => {
    h.convexMutation.mockResolvedValue("id-1");
    await stateRepoUserStateAdapter.set(ctx, USER, selections, doc({ a: "1" }));

    const [, args] = h.convexMutation.mock.calls[0]!;
    expect(args).toMatchObject({
      tenantId: "acme/shop",
      namespace: "selections",
      userKey: userFileKey(USER),
      data: { a: "1" },
      updatedAt: "2026-07-11T00:00:00.000Z",
    });
  });
});
