/**
 * Unit tests for the user-state service
 * (src/dashboard/lib/user-state/service.ts): merge policies, schema
 * rejection with typed errors, and `state.entity.written` emission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
  emitSystemEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@dashboard/lib/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
}));
vi.mock("@dashboard/lib/logger", () => ({ logger: h.logger }));
vi.mock("@dashboard/lib/events", () => ({
  emitSystemEvent: h.emitSystemEvent,
}));

import { getUserState, setUserState } from "@dashboard/lib/user-state/service";
import { _resetUserStateConfigCache } from "@dashboard/lib/user-state/config";
import { _resetUserStateDocCache } from "@dashboard/lib/user-state/adapters/state-repo";
import { UserStateError } from "@dashboard/lib/user-state/types";

const ctx = {
  octokit: {} as Octokit,
  owner: "acme",
  repo: "shop",
  userId: "client:jane@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetUserStateConfigCache();
  _resetUserStateDocCache();
  // No brand config, no existing docs by default.
  h.readStateText.mockRejectedValue({ status: 404 });
  h.writeStateText.mockResolvedValue({ sha: "s", path: "p", htmlUrl: null });
});

describe("getUserState", () => {
  it("throws a typed 404 for unknown namespaces", async () => {
    await expect(getUserState(ctx, "nope")).rejects.toMatchObject({
      code: "namespace_not_found",
      status: 404,
    });
  });

  it("returns null when the user has no document", async () => {
    expect(await getUserState(ctx, "selections")).toBeNull();
  });
});

describe("setUserState", () => {
  it("writes a validated doc and emits state.entity.written", async () => {
    const doc = await setUserState(
      ctx,
      "selections",
      { theme: "dark" },
      { source: "model" },
    );

    expect(doc.namespace).toBe("selections");
    expect(doc.userId).toBe(ctx.userId);
    expect(doc.data).toEqual({ theme: "dark" });
    expect(h.writeStateText).toHaveBeenCalledTimes(1);
    expect(h.emitSystemEvent).toHaveBeenCalledWith(
      "state.entity.written",
      expect.objectContaining({
        namespace: "selections",
        namespaceVersion: 1,
        keys: ["theme"],
        source: "model",
      }),
      expect.objectContaining({
        userId: ctx.userId,
        brand: { owner: "acme", repo: "shop" },
        source: "model",
      }),
    );
  });

  it("shallow-merges with the existing document", async () => {
    h.readStateText.mockResolvedValue({
      content: JSON.stringify({
        version: 1,
        namespace: "selections",
        userId: ctx.userId,
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: { theme: "dark", lang: "en" },
      }),
      sha: "s0",
      path: "p",
    });

    const doc = await setUserState(
      ctx,
      "selections",
      { lang: "he" },
      { source: "server" },
    );
    expect(doc.data).toEqual({ theme: "dark", lang: "he" });
  });

  it("re-merges against fresh data and retries once on a write conflict", async () => {
    // First read: original doc. Conflict on write. Second read (post-cache
    // clear): a concurrent writer added `other`. The retry must keep it.
    h.readStateText
      .mockResolvedValueOnce({
        content: JSON.stringify({
          version: 1,
          namespace: "selections",
          userId: ctx.userId,
          updatedAt: "2026-07-01T00:00:00.000Z",
          data: { theme: "dark" },
        }),
        sha: "s0",
        path: "p",
      })
      .mockResolvedValueOnce({ content: "{}", sha: "s0", path: "p" })
      .mockResolvedValue({
        content: JSON.stringify({
          version: 1,
          namespace: "selections",
          userId: ctx.userId,
          updatedAt: "2026-07-02T00:00:00.000Z",
          data: { theme: "dark", other: "kept" },
        }),
        sha: "s1",
        path: "p",
      });
    h.writeStateText
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ sha: "s2", path: "p", htmlUrl: null });

    const doc = await setUserState(
      ctx,
      "selections",
      { lang: "he" },
      { source: "server" },
    );
    expect(doc.data).toEqual({ theme: "dark", other: "kept", lang: "he" });
    expect(h.writeStateText).toHaveBeenCalledTimes(2);
  });

  it("rejects data that fails the namespace schema, without writing", async () => {
    await expect(
      setUserState(ctx, "stats", { visits: "not-a-number" }, { source: "server" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof UserStateError &&
        error.code === "validation_failed" &&
        error.status === 422 &&
        error.issues.length > 0,
    );
    expect(h.writeStateText).not.toHaveBeenCalled();
    expect(h.emitSystemEvent).not.toHaveBeenCalled();
  });
});
