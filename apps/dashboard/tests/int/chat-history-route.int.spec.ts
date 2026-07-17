/**
 * @fileoverview Integration coverage for the chat history route
 *   (Convex transcript first, state-repo JSONL fallback).
 * @testFramework vitest
 * @domain chat
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "ghp_test",
  })),
  getUserOctokit: vi.fn(async () => ({}) as unknown),
}));

const convex = vi.hoisted(() => ({
  query: vi.fn(),
}));

const stateRepo = vi.hoisted(() => ({
  readStateText: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@kody-ade/base/state-repo", () => stateRepo);
vi.mock("@dashboard/lib/backend/convex-backend", () => ({
  getConvexClient: () => convex,
  backendApi: { chatTurns: { list: "chatTurns.list" } },
  tenantIdFor: (owner: string, repo: string) => `${owner}/${repo}`,
}));

import { GET } from "../../app/api/kody/chat/history/route";

function makeReq(query: string): NextRequest {
  return new NextRequest(`https://dash.test/api/kody/chat/history?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireKodyAuth.mockResolvedValue(null);
  auth.getRequestAuth.mockReturnValue({
    owner: "acme",
    repo: "widgets",
    token: "ghp_test",
  });
  auth.getUserOctokit.mockResolvedValue({});
  convex.query.mockResolvedValue([]);
  stateRepo.readStateText.mockResolvedValue(null);
});

describe("GET /api/kody/chat/history", () => {
  it("returns Convex turns sorted by sequence", async () => {
    convex.query.mockResolvedValue([
      {
        seq: 2,
        turn: { role: "assistant", content: "hi there", timestamp: "t2" },
      },
      { seq: 1, turn: { role: "user", content: "hello", timestamp: "t1" } },
    ]);

    const res = await GET(makeReq("taskId=task-1"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      messages: [
        { role: "user", content: "hello", timestamp: "t1" },
        { role: "assistant", content: "hi there", timestamp: "t2" },
      ],
    });
    expect(convex.query).toHaveBeenCalledWith("chatTurns.list", {
      tenantId: "acme/widgets",
      sessionId: "task-1",
    });
    expect(stateRepo.readStateText).not.toHaveBeenCalled();
  });

  it("requires a taskId", async () => {
    const res = await GET(makeReq(""));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "taskId required" });
    expect(convex.query).not.toHaveBeenCalled();
  });

  it("falls back to the state-repo JSONL file for pre-migration sessions", async () => {
    stateRepo.readStateText.mockResolvedValue({
      content: [
        JSON.stringify({ role: "user", content: "old msg", timestamp: "t1" }),
        "not-json",
        JSON.stringify({
          role: "assistant",
          content: "old reply",
          timestamp: "t2",
        }),
      ].join("\n"),
    });

    const res = await GET(makeReq("taskId=legacy-1"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      messages: [
        { role: "user", content: "old msg", timestamp: "t1" },
        { role: "assistant", content: "old reply", timestamp: "t2" },
      ],
    });
    expect(stateRepo.readStateText).toHaveBeenCalledWith(
      expect.anything(),
      "acme",
      "widgets",
      "sessions/legacy-1.jsonl",
    );
  });

  it("returns empty messages when neither store has the session", async () => {
    const res = await GET(makeReq("taskId=missing-1"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ messages: [] });
  });

  it("returns 503 when the fallback has no GitHub token", async () => {
    auth.getUserOctokit.mockResolvedValue(null as never);

    const res = await GET(makeReq("taskId=legacy-1"));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "No GitHub token available",
    });
  });

  it("maps 404 fetch failures to an empty history", async () => {
    convex.query.mockRejectedValue(
      Object.assign(new Error("Not Found"), { status: 404 }),
    );

    const res = await GET(makeReq("taskId=task-404"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ messages: [] });
  });

  it("returns 500 on unexpected fetch failures", async () => {
    convex.query.mockRejectedValue(new Error("convex exploded"));

    const res = await GET(makeReq("taskId=task-1"));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "convex exploded" });
  });
});
