/**
 * Unit tests for the user-state service
 * (src/dashboard/lib/user-state/service.ts): merge policies, schema
 * rejection with typed errors, and `state.entity.written` emission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import { getFunctionName } from "convex/server";

const h = vi.hoisted(() => ({
  convexQuery: vi.fn(),
  convexMutation: vi.fn(),
  emitSystemEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = h.convexQuery;
    mutation = h.convexMutation;
  },
}));
vi.mock("@kody-ade/base/logger", () => ({ logger: h.logger }));
vi.mock("@kody-ade/base/events", () => ({
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
  // Backend requires a URL to construct the cached client; the mock
  // ConvexHttpClient ignores it.
  process.env.CONVEX_URL = "https://test.convex.cloud";
  // No existing docs by default.
  h.convexQuery.mockResolvedValue(null);
  h.convexMutation.mockResolvedValue("id-1");
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
    expect(h.convexMutation).toHaveBeenCalledTimes(1);
    const [ref, args] = h.convexMutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("userState:save");
    expect(args).toMatchObject({
      tenantId: "acme/shop",
      namespace: "selections",
      data: { theme: "dark" },
    });
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
    h.convexQuery.mockResolvedValue({
      data: { theme: "dark", lang: "en" },
      updatedAt: "2026-07-01T00:00:00.000Z",
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
    // First read: original doc. Conflict on write. The retry reads again
    // and merges against the concurrent writer's data — the new `other`
    // field must survive into the final doc.
    h.convexQuery
      .mockResolvedValueOnce({
        data: { theme: "dark" },
        updatedAt: "2026-07-01T00:00:00.000Z",
      })
      .mockResolvedValue({
        data: { theme: "dark", other: "kept" },
        updatedAt: "2026-07-02T00:00:00.000Z",
      });
    h.convexMutation
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValue("id-final");

    const doc = await setUserState(
      ctx,
      "selections",
      { lang: "he" },
      { source: "server" },
    );
    expect(doc.data).toEqual({ theme: "dark", other: "kept", lang: "he" });
    expect(h.convexMutation).toHaveBeenCalledTimes(2);
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
    expect(h.convexMutation).not.toHaveBeenCalled();
    expect(h.emitSystemEvent).not.toHaveBeenCalled();
  });
});
