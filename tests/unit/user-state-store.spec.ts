/**
 * Unit tests for the state-repo user-state adapter and user file keys
 * (src/dashboard/lib/user-state/adapters/state-repo.ts, user-key.ts):
 * per-user paths, 404→null, ETag 304 refresh, CAS retry on 409.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
}));

vi.mock("@dashboard/lib/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
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
  it("reads the per-user per-namespace path", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify(doc({ theme: "dark" })),
      sha: "s1",
      etag: 'W/"1"',
      path: "x",
    });
    const result = await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(result?.data).toEqual({ theme: "dark" });
    expect(h.readStateText).toHaveBeenCalledWith(
      ctx.octokit,
      "acme",
      "shop",
      userStateFilePath("selections", USER),
      expect.anything(),
    );
  });

  it("returns null on 404", async () => {
    h.readStateText.mockRejectedValue({ status: 404 });
    expect(
      await stateRepoUserStateAdapter.get(ctx, USER, selections),
    ).toBeNull();
  });

  it("serves the cached doc on 304", async () => {
    h.readStateText.mockResolvedValueOnce({
      content: JSON.stringify(doc({ theme: "dark" })),
      sha: "s1",
      etag: 'W/"1"',
      path: "x",
    });
    await stateRepoUserStateAdapter.get(ctx, USER, selections);
    h.readStateText.mockRejectedValueOnce({ status: 304 });
    const result = await stateRepoUserStateAdapter.get(ctx, USER, selections);
    expect(result?.data).toEqual({ theme: "dark" });
  });
});

describe("stateRepoUserStateAdapter.set", () => {
  it("writes with the existing sha", async () => {
    h.readStateText.mockResolvedValue({ content: "{}", sha: "old", path: "x" });
    h.writeStateText.mockResolvedValue({ sha: "new", path: "x", htmlUrl: null });
    await stateRepoUserStateAdapter.set(ctx, USER, selections, doc({ a: "1" }));
    expect(h.writeStateText).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "old" }),
    );
  });

  it("propagates a conflict instead of rewriting stale content", async () => {
    h.readStateText.mockResolvedValue({ content: "{}", sha: "old", path: "x" });
    h.writeStateText.mockRejectedValue({ status: 409 });
    await expect(
      stateRepoUserStateAdapter.set(ctx, USER, selections, doc({ a: "1" })),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.writeStateText).toHaveBeenCalledTimes(1);
  });
});
