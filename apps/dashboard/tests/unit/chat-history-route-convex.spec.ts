/**
 * Unit tests for GET /api/kody/chat/history on the Convex backend: reads
 * chatTurns.list is the sole runtime source. Response contract is `{ messages }`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

const h = vi.hoisted(() => ({
  readStateText: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "t",
  })),
  getUserOctokit: vi.fn(async () => ({}) as never),
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import { GET } from "../../app/api/kody/chat/history/route";

function makeReq(taskId?: string): NextRequest {
  const qs = taskId ? `?taskId=${taskId}` : "";
  return new NextRequest(`https://dash.test/api/kody/chat/history${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("GET /api/kody/chat/history (convex)", () => {
  it("400s without taskId", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("returns ordered turns from chatTurns.list", async () => {
    convex.query.mockResolvedValue([
      {
        seq: 1,
        turn: { role: "assistant", content: "hi!", timestamp: "t2" },
      },
      { seq: 0, turn: { role: "user", content: "hi", timestamp: "t1" } },
    ]);

    const res = await GET(makeReq("live-123"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.map((m: { content: string }) => m.content)).toEqual([
      "hi",
      "hi!",
    ]);
    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatTurns:list");
    expect(args).toEqual({ tenantId: "acme/widgets", sessionId: "live-123" });
    expect(h.readStateText).not.toHaveBeenCalled();
  });

  it("does not fall back to GitHub when Convex has no turns", async () => {
    convex.query.mockResolvedValue([]);
    h.readStateText.mockResolvedValue({
      content:
        JSON.stringify({ role: "user", content: "old", timestamp: "t" }) + "\n",
      sha: "s",
      path: "sessions/live-old.jsonl",
    });

    const res = await GET(makeReq("live-old"));
    const body = await res.json();
    expect(body.messages).toEqual([]);
    expect(h.readStateText).not.toHaveBeenCalled();
  });

  it("returns empty messages when neither store has the session", async () => {
    convex.query.mockResolvedValue([]);
    h.readStateText.mockResolvedValue(null);
    const res = await GET(makeReq("nope"));
    expect(await res.json()).toEqual({ messages: [] });
  });
});
