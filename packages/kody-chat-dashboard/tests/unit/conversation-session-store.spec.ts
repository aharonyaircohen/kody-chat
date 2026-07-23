import { describe, expect, it } from "vitest";
import {
  mapConversationDetail,
  reconcileConversationMessages,
} from "../../src/dashboard/lib/chat/core/conversation/conversation-session-store";

describe("conversation session store", () => {
  const renderedView = {
    action: "render_view" as const,
    view: "renderer" as const,
    id: "view-1",
    rendererSlug: "summary",
    rendererName: "Summary",
    resultTarget: "chat" as const,
    ui: { type: "text" as const, value: "Persisted result" },
    data: { status: "ready" },
  };

  it("hydrates messages and handoffs from the ordered canonical timeline", () => {
    const result = mapConversationDetail({
      conversation: {
        conversationId: "c1",
        title: "Risk",
        pinned: false,
        activeAgent: { slug: "ceo", title: "CEO" },
        runtime: { kind: "direct", modelId: "model-1" },
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T10:03:00.000Z",
      },
      entries: [
        {
          entryId: "m1",
          seq: 0,
          entry: {
            kind: "message",
            role: "user",
            content: "Review this",
            status: "committed",
            createdAt: "2026-07-20T10:00:00.000Z",
          },
        },
        {
          entryId: "h1",
          seq: 1,
          entry: {
            kind: "agent-handoff",
            from: { slug: "ux", title: "UX" },
            to: { slug: "ceo", title: "CEO" },
            createdAt: "2026-07-20T10:02:00.000Z",
          },
        },
      ],
      checkpoints: [],
    });

    expect(result.messages[0]).toMatchObject({ id: "m1", text: "Review this" });
    expect(result.session.agentHandoffs).toEqual([
      expect.objectContaining({ fromSlug: "ux", toSlug: "ceo" }),
    ]);
  });

  it("keeps streaming assistant drafts out of durable storage", () => {
    const previous: (typeof pending)[] = [];
    const pending = {
      id: "a1",
      role: "assistant" as const,
      text: "",
      timestamp: "2026-07-20T10:00:00.000Z",
      isLoading: true,
    };
    const append = reconcileConversationMessages(previous, [pending]);
    const streamed = reconcileConversationMessages(
      [pending],
      [{ ...pending, text: "Still typing" }],
    );

    expect(append).toEqual([]);
    expect(streamed).toEqual([]);
  });

  it("appends the complete assistant message once streaming finishes", () => {
    const pending = {
      id: "a1",
      role: "assistant" as const,
      text: "Still typing",
      timestamp: "2026-07-20T10:00:00.000Z",
      isLoading: true,
    };

    expect(
      reconcileConversationMessages(
        [pending],
        [{ ...pending, text: "Done", isLoading: false }],
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "append",
        message: expect.objectContaining({
          id: "a1",
          text: "Done",
          isLoading: false,
        }),
      }),
    ]);
  });

  it("restores a validated rendered answer from canonical storage", () => {
    const result = mapConversationDetail({
      conversation: {
        conversationId: "c1",
        title: "Rendered answer",
        pinned: false,
        activeAgent: { slug: "kody", title: "Kody" },
        runtime: { kind: "direct", modelId: "model-1" },
        createdAt: "2026-07-20T10:00:00.000Z",
        updatedAt: "2026-07-20T10:03:00.000Z",
      },
      entries: [
        {
          entryId: "a1",
          seq: 0,
          entry: {
            kind: "message",
            role: "assistant",
            content: "",
            status: "committed",
            createdAt: "2026-07-20T10:00:00.000Z",
            view: renderedView,
          },
        },
      ],
      checkpoints: [],
    });

    expect(result.messages[0]?.view).toEqual(renderedView);
  });

  it("persists a rendered answer added to an existing streaming message", () => {
    const pending = {
      id: "a1",
      role: "assistant" as const,
      text: "",
      timestamp: "2026-07-20T10:00:00.000Z",
      isLoading: true,
    };

    expect(
      reconcileConversationMessages(
        [pending],
        [{ ...pending, isLoading: false, view: renderedView }],
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "append",
        message: expect.objectContaining({ view: renderedView }),
      }),
    ]);
  });
});
