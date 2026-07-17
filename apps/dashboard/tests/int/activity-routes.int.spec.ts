/**
 * @fileoverview Integration tests for GET /api/kody/activity and
 *   GET /api/kody/activity/feed.
 * @testFramework vitest
 * @domain kody
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null as unknown),
  getRequestAuth: vi.fn(
    () => ({ owner: "owner", repo: "repo", token: "tok" }) as unknown,
  ),
  fetchWorkflowRuns: vi.fn(async () => [] as unknown[]),
  fetchIssues: vi.fn(async () => [] as unknown[]),
  buildActivitySnapshot: vi.fn(() => ({ snapshot: true })),
  mapRunActions: vi.fn(() => new Map()),
  mapRunIssueNumbers: vi.fn(() => new Map()),
  readFeedEntries: vi.fn(async () => [] as unknown[]),
  buildFeedSnapshot: vi.fn(() => ({ feed: true })),
  handleKodyApiError: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: (...a: unknown[]) => mocks.requireKodyAuth(...(a as [])),
  getRequestAuth: (...a: unknown[]) => mocks.getRequestAuth(...(a as [])),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  fetchWorkflowRuns: (...a: unknown[]) =>
    mocks.fetchWorkflowRuns(...(a as [])),
  fetchIssues: (...a: unknown[]) => mocks.fetchIssues(...(a as [])),
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@dashboard/lib/activity/snapshot", () => ({
  buildActivitySnapshot: (...a: unknown[]) =>
    mocks.buildActivitySnapshot(...(a as [])),
}));

vi.mock("@dashboard/lib/activity/action", () => ({
  mapRunActions: (...a: unknown[]) => mocks.mapRunActions(...(a as [])),
  mapRunIssueNumbers: (...a: unknown[]) =>
    mocks.mapRunIssueNumbers(...(a as [])),
}));

vi.mock("@dashboard/lib/activity/feed-source", () => ({
  readFeedEntries: (...a: unknown[]) => mocks.readFeedEntries(...(a as [])),
}));

vi.mock("@dashboard/lib/activity/feed", () => ({
  buildFeedSnapshot: (...a: unknown[]) =>
    mocks.buildFeedSnapshot(...(a as [])),
}));

vi.mock("@dashboard/lib/github-error-handler", async () => {
  const { NextResponse: NR } = await import("next/server");
  return {
    handleKodyApiError: (...a: unknown[]) => {
      mocks.handleKodyApiError(...(a as []));
      return NR.json({ error: "handled" }, { status: 500 });
    },
  };
});

import { NextResponse } from "next/server";
import { GET as getActivity } from "../../app/api/kody/activity/route";
import { GET as getFeed } from "../../app/api/kody/activity/feed/route";

const req = {} as Parameters<typeof getActivity>[0];

describe("GET /api/kody/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the activity snapshot from runs and issues", async () => {
    const runs = [{ id: 1 }];
    const issues = [{ number: 2 }];
    mocks.fetchWorkflowRuns.mockResolvedValueOnce(runs);
    mocks.fetchIssues.mockResolvedValueOnce(issues);

    const res = await getActivity(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ snapshot: true });
    expect(mocks.fetchWorkflowRuns).toHaveBeenCalledWith({ perPage: 100 });
    expect(mocks.fetchIssues).toHaveBeenCalledWith({
      state: "open",
      perPage: 100,
    });
    expect(mocks.mapRunActions).toHaveBeenCalledWith(runs, issues);
    expect(mocks.buildActivitySnapshot).toHaveBeenCalledWith(
      runs,
      expect.any(Number),
      expect.any(Map),
      expect.any(Map),
    );
  });

  it("returns the auth response when unauthenticated", async () => {
    mocks.requireKodyAuth.mockResolvedValueOnce(
      NextResponse.json({ message: "nope" }, { status: 401 }),
    );
    const res = await getActivity(req);
    expect(res.status).toBe(401);
    expect(mocks.fetchWorkflowRuns).not.toHaveBeenCalled();
  });

  it("delegates failures to handleKodyApiError", async () => {
    const err = new Error("boom");
    mocks.fetchWorkflowRuns.mockRejectedValueOnce(err);
    const res = await getActivity(req);
    expect(res.status).toBe(500);
    expect(mocks.handleKodyApiError).toHaveBeenCalledWith(err, "activity");
  });
});

describe("GET /api/kody/activity/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequestAuth.mockReturnValue({
      owner: "owner",
      repo: "repo",
      token: "tok",
    });
  });

  it("returns the feed snapshot built from the state-repo entries", async () => {
    const entries = [{ sessionId: "s1" }];
    mocks.readFeedEntries.mockResolvedValueOnce(entries);

    const res = await getFeed(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ feed: true });
    expect(mocks.readFeedEntries).toHaveBeenCalledWith(
      "owner",
      "repo",
      "tok",
    );
    expect(mocks.buildFeedSnapshot).toHaveBeenCalledWith(entries);
  });

  it("returns an empty feed when repo auth headers are missing", async () => {
    mocks.getRequestAuth.mockReturnValueOnce(null);
    const res = await getFeed(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.events).toEqual([]);
    expect(json.total).toBe(0);
    expect(mocks.readFeedEntries).not.toHaveBeenCalled();
  });

  it("returns the auth response when unauthenticated", async () => {
    mocks.requireKodyAuth.mockResolvedValueOnce(
      NextResponse.json({ message: "nope" }, { status: 401 }),
    );
    const res = await getFeed(req);
    expect(res.status).toBe(401);
  });

  it("delegates failures to handleKodyApiError", async () => {
    const err = new Error("read failed");
    mocks.readFeedEntries.mockRejectedValueOnce(err);
    const res = await getFeed(req);
    expect(res.status).toBe(500);
    expect(mocks.handleKodyApiError).toHaveBeenCalledWith(
      err,
      "activity-feed",
    );
  });
});
