import { describe, expect, it } from "vitest";
import {
  mapConversationDetail,
  reconcileConversationMessages,
} from "../../src/dashboard/lib/chat/core/conversation/conversation-session-store";

describe("conversation session store", () => {
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

  it("produces one append then updates the same streaming message", () => {
    const previous: (typeof pending)[] = [];
    const pending = {
      id: "a1",
      role: "assistant" as const,
      text: "",
      timestamp: "2026-07-20T10:00:00.000Z",
      isLoading: true,
    };
    const append = reconcileConversationMessages(previous, [pending]);
    const update = reconcileConversationMessages(
      [pending],
      [{ ...pending, text: "Done", isLoading: false }],
    );

    expect(append).toEqual([
      expect.objectContaining({ kind: "append", message: pending }),
    ]);
    expect(update).toEqual([
      expect.objectContaining({
        kind: "update",
        message: expect.objectContaining({ id: "a1" }),
      }),
    ]);
  });
});
