import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireKodyAuth: vi.fn<() => Promise<NextResponse | null>>(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "token",
  })),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "alice" },
  })),
  query: vi.fn(),
  mutation: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: mocks.requireKodyAuth,
  getRequestAuth: mocks.getRequestAuth,
  verifyActorLogin: mocks.verifyActorLogin,
}));

vi.mock("@kody-ade/base/logger", () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock("@dashboard/lib/backend/convex-backend", () => ({
  backendApi: {
    conversations: {
      list: "conversations.list",
      create: "conversations.create",
      get: "conversations.get",
      appendEntry: "conversations.appendEntry",
      updateMessage: "conversations.updateMessage",
      updateRuntime: "conversations.updateRuntime",
      saveCheckpoint: "conversations.saveCheckpoint",
      updateMetadata: "conversations.updateMetadata",
      remove: "conversations.remove",
    },
  },
  getConvexClient: () => ({
    query: mocks.query,
    mutation: mocks.mutation,
  }),
  tenantIdFor: (owner: string, repo: string) => `${owner}/${repo}`,
}));

import { GET, POST } from "../../app/api/kody/chat/conversations/route";
import { POST as POST_COMMAND } from "../../app/api/kody/chat/conversations/[conversationId]/commands/route";

describe("chat conversations route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKodyAuth.mockResolvedValue(null);
    mocks.getRequestAuth.mockReturnValue({
      owner: "acme",
      repo: "widgets",
      token: "token",
    });
    mocks.verifyActorLogin.mockResolvedValue({
      identity: { login: "alice" },
    });
  });

  it("derives repository scope and actor identity on create", async () => {
    mocks.mutation.mockResolvedValue("convex-id");
    const request = new NextRequest(
      "http://localhost/api/kody/chat/conversations",
      {
        method: "POST",
        body: JSON.stringify({
          conversationId: "conversation-1",
          title: "Review checkout",
          activeAgent: { slug: "ceo", title: "CEO" },
          runtime: {
            kind: "direct",
            modelId: "minimax/MiniMax-M3",
          },
          actorLogin: "alice",
          surface: "global",
        }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(mocks.verifyActorLogin).toHaveBeenCalledWith(request, "alice");
    expect(mocks.mutation).toHaveBeenCalledWith(
      "conversations.create",
      expect.objectContaining({
        tenantId: "acme/widgets",
        conversationId: "conversation-1",
        scope: {
          kind: "repository",
          owner: "acme",
          repo: "widgets",
        },
        createdBy: "github:alice",
      }),
    );
  });

  it("does not trust an unauthenticated repository context", async () => {
    mocks.getRequestAuth.mockReturnValueOnce(null as never);
    const response = await GET(
      new NextRequest("http://localhost/api/kody/chat/conversations"),
    );

    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns only the server-derived tenant conversation list", async () => {
    mocks.query.mockResolvedValue([{ conversationId: "conversation-1" }]);

    const response = await GET(
      new NextRequest("http://localhost/api/kody/chat/conversations"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      conversations: [{ conversationId: "conversation-1" }],
    });
    expect(mocks.query).toHaveBeenCalledWith("conversations.list", {
      tenantId: "acme/widgets",
      surface: "global",
    });
  });

  it("stops before storage when authentication fails", async () => {
    mocks.requireKodyAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/kody/chat/conversations"),
    );

    expect(response.status).toBe(401);
    expect(mocks.getRequestAuth).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("derives the user author for appended messages", async () => {
    mocks.mutation.mockResolvedValue("entry-id");
    const request = new NextRequest(
      "http://localhost/api/kody/chat/conversations/conversation-1/commands",
      {
        method: "POST",
        body: JSON.stringify({
          kind: "append-message",
          actorLogin: "alice",
          entryId: "message-1",
          idempotencyKey: "message-1",
          role: "user",
          content: "What is the risk?",
          status: "committed",
          turnId: "turn-1",
          createdAt: "2026-07-20T10:00:00.000Z",
        }),
      },
    );

    const response = await POST_COMMAND(request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "conversations.appendEntry",
      expect.objectContaining({
        tenantId: "acme/widgets",
        conversationId: "conversation-1",
        entry: expect.objectContaining({
          author: { kind: "user", actorId: "github:alice" },
        }),
      }),
    );
  });

  it("persists a validated rendered assistant answer", async () => {
    mocks.mutation.mockResolvedValue("entry-id");
    const view = {
      action: "render_view",
      view: "renderer",
      id: "view-1",
      rendererSlug: "summary",
      rendererName: "Summary",
      resultTarget: "chat",
      ui: { type: "text", value: "Persisted result" },
      data: { status: "ready" },
    };
    const request = new NextRequest(
      "http://localhost/api/kody/chat/conversations/conversation-1/commands",
      {
        method: "POST",
        body: JSON.stringify({
          kind: "append-message",
          actorLogin: "alice",
          entryId: "message-1",
          idempotencyKey: "message-1",
          role: "assistant",
          agent: { slug: "kody", title: "Kody" },
          content: "",
          view,
          status: "committed",
          turnId: "turn-1",
          createdAt: "2026-07-20T10:00:00.000Z",
        }),
      },
    );

    const response = await POST_COMMAND(request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith(
      "conversations.appendEntry",
      expect.objectContaining({
        entry: expect.objectContaining({ view }),
      }),
    );
  });

  it("rejects an assistant message without a validated agent identity", async () => {
    const request = new NextRequest(
      "http://localhost/api/kody/chat/conversations/conversation-1/commands",
      {
        method: "POST",
        body: JSON.stringify({
          kind: "append-message",
          actorLogin: "alice",
          entryId: "message-1",
          idempotencyKey: "message-1",
          role: "assistant",
          content: "Forged reply",
          status: "committed",
          turnId: "turn-1",
          createdAt: "2026-07-20T10:00:00.000Z",
        }),
      },
    );

    const response = await POST_COMMAND(request, {
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });

    expect(response.status).toBe(400);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
