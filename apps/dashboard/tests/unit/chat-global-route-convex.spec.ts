/**
 * Unit tests for /api/kody/chat/global on the Convex backend: repoDocs kind
 * "chat-global" (snapshot) + "chat-global-gate" (24h per-session gate).
 * Response contracts unchanged from the state-repo era.
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

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "t",
  })),
  getUserOctokit: vi.fn(async () => ({}) as never),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
  getOwner: () => "acme",
  getRepo: () => "widgets",
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import { GET, POST } from "../../app/api/kody/chat/global/route";

function getReq(sessionId?: string): NextRequest {
  const qs = sessionId ? `?sessionId=${sessionId}` : "";
  return new NextRequest(`https://dash.test/api/kody/chat/global${qs}`);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("https://dash.test/api/kody/chat/global", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function mockDocs(docs: Record<string, unknown>) {
  convex.query.mockImplementation(async (_ref: unknown, args: unknown) => {
    const { kind } = args as { kind: string };
    return kind in docs ? { doc: docs[kind], updatedAt: "t" } : null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("GET /api/kody/chat/global (convex)", () => {
  it("400s without sessionId", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(400);
  });

  it("returns empty messages when no snapshot exists", async () => {
    mockDocs({});
    const res = await GET(getReq("s1"));
    expect(await res.json()).toEqual({ messages: [] });
  });

  it("returns the persisted snapshot", async () => {
    mockDocs({
      "chat-global": {
        version: 1,
        sessionId: "s1",
        updatedAt: "2026-07-15T00:00:00Z",
        messages: [{ role: "user", text: "hey", timestamp: "t" }],
      },
    });
    const res = await GET(getReq("s1"));
    const body = await res.json();
    expect(body.sessionId).toBe("s1");
    expect(body.messages).toHaveLength(1);
  });
});

describe("POST /api/kody/chat/global (convex)", () => {
  const messages = [{ role: "user", text: "hello" }];

  it("skips empty message arrays", async () => {
    const res = await POST(postReq({ sessionId: "s1", messages: [] }));
    expect(await res.json()).toEqual({ success: true, skipped: "empty" });
  });

  it("skips when the 24h gate is closed for this session", async () => {
    mockDocs({
      "chat-global-gate": { s1: new Date().toISOString() },
    });
    const res = await POST(postReq({ sessionId: "s1", messages }));
    expect(await res.json()).toEqual({ success: true, skipped: "gated-24h" });
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("skips when the snapshot fingerprint is unchanged", async () => {
    mockDocs({
      "chat-global": {
        version: 1,
        sessionId: "s1",
        updatedAt: "t",
        messages: [{ role: "user", text: "hello", timestamp: "t" }],
      },
    });
    const res = await POST(postReq({ sessionId: "s1", messages }));
    expect(await res.json()).toEqual({ success: true, skipped: "unchanged" });
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("writes the snapshot and bumps the gate via repoDocs.save", async () => {
    mockDocs({});
    convex.mutation.mockResolvedValue(null);

    const res = await POST(postReq({ sessionId: "s1", messages }));
    expect(await res.json()).toEqual({ success: true, written: 1 });

    expect(convex.mutation).toHaveBeenCalledTimes(2);
    const [saveRef, saveArgs] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(saveRef)).toBe("repoDocs:save");
    expect(saveArgs).toMatchObject({
      tenantId: "acme/widgets",
      kind: "chat-global",
      doc: { version: 1, sessionId: "s1" },
    });
    const [, gateArgs] = convex.mutation.mock.calls[1]!;
    expect(gateArgs).toMatchObject({ kind: "chat-global-gate" });
    expect(
      (gateArgs as { doc: Record<string, string> }).doc.s1,
    ).toBeTruthy();
  });
});
