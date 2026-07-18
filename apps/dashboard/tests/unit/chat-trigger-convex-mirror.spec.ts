/**
 * Unit tests for the Convex transcript mirror in POST /api/kody/chat/trigger:
 * session metadata and new turns are written to Convex before workflow dispatch.
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
  writeStateText: vi.fn(),
  createWorkflowDispatch: vi.fn(async () => ({})),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "t",
  })),
  getUserOctokit: vi.fn(async () => ({
    rest: { actions: { createWorkflowDispatch: h.createWorkflowDispatch } },
  })),
}));

vi.mock("@kody-ade/base/state-repo", () => ({
  readStateText: h.readStateText,
  writeStateText: h.writeStateText,
}));

vi.mock("@kody-ade/base/events", () => ({
  emitSystemEvent: vi.fn(),
}));

vi.mock("@kody-ade/base/github/core", () => ({
  createUserOctokit: vi.fn(() => ({}) as never),
}));

vi.mock("@kody-ade/kody-chat/user-state", () => ({
  ensureTriggerStateWriter: vi.fn(),
}));

vi.mock("@kody-ade/kody-chat/platform/surface-scope", () => ({
  rejectSurfaceScopedRequest: vi.fn(() => null),
}));

vi.mock("@kody-ade/kody-chat/platform/plugin-tools-config", () => ({
  maybeAppendPluginToolsToken: vi.fn((url: string) => url),
}));

vi.mock("@dashboard/lib/chat-token", () => ({
  mintSessionToken: vi.fn(() => "tok"),
}));

vi.mock("@dashboard/lib/health/dispatch-failures", () => ({
  recordDispatchFailure: vi.fn(),
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import { POST } from "../../app/api/kody/chat/trigger/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("https://dash.test/api/kody/chat/trigger", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const messages = [
  { role: "user", content: "one", timestamp: "t1" },
  { role: "assistant", content: "two", timestamp: "t2" },
  { role: "user", content: "three", timestamp: "t3" },
];

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  delete process.env.KODY_CHAT_WORKFLOW_REPO;
  h.readStateText.mockResolvedValue(null);
  h.writeStateText.mockResolvedValue({});
});

describe("POST /api/kody/chat/trigger convex mirror", () => {
  it("writes session + new turns only to Convex", async () => {
    convex.query.mockResolvedValue([{ seq: 0 }]); // one turn already recorded
    convex.mutation.mockResolvedValue(null);

    const res = await POST(makeReq({ taskId: "live-9", messages }));
    expect(res.status).toBe(200);

    // Engine dependency: sessions/<id>.jsonl still written to the state repo.
    expect(h.writeStateText).not.toHaveBeenCalled();

    // Session meta upserted.
    const upsert = convex.mutation.mock.calls.find(
      ([ref]) => getFunctionName(ref as never) === "chatSessions:upsert",
    )!;
    expect(upsert[1]).toMatchObject({
      tenantId: "acme/widgets",
      sessionId: "live-9",
      meta: { type: "meta", mode: "one-shot" },
    });

    // Only the two messages beyond the recorded turn count are appended.
    const appends = convex.mutation.mock.calls.filter(
      ([ref]) => getFunctionName(ref as never) === "chatTurns:append",
    );
    expect(
      appends.map(
        ([, args]) => (args as { turn: { content: string } }).turn.content,
      ),
    ).toEqual(["two", "three"]);

    expect(h.createWorkflowDispatch).toHaveBeenCalled();
  });

  it("a Convex failure blocks dispatch so runtime state is not lost", async () => {
    convex.query.mockRejectedValue(new Error("backend down"));

    const res = await POST(makeReq({ taskId: "live-9", messages }));
    expect(res.status).toBe(500);
    expect(h.createWorkflowDispatch).not.toHaveBeenCalled();
  });
});
