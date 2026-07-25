import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationClient,
  createConversationClient,
  type ConversationCommand,
} from "../../src/dashboard/lib/chat/core/conversation/conversation-client";

describe("ConversationClient", () => {
  const fetcher = vi.fn<typeof fetch>();
  const client = new ConversationClient(fetcher);

  beforeEach(() => {
    fetcher.mockReset();
  });

  it("loads conversations without using browser storage", async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ conversations: [{ conversationId: "c1" }] }),
      ),
    );

    await expect(client.list()).resolves.toEqual([{ conversationId: "c1" }]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/kody/chat/conversations?surface=global",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses the browser fetch receiver safely", async () => {
    const original = globalThis.fetch;
    const receiverAware = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(
        new Response(JSON.stringify({ conversations: [] })),
      );
    });
    vi.stubGlobal("fetch", receiverAware);
    try {
      const browserClient = new ConversationClient();
      await expect(browserClient.list()).resolves.toEqual([]);
    } finally {
      vi.stubGlobal("fetch", original);
    }
  });

  it("applies client-surface headers to every conversation request", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ conversations: [] })),
    );
    const surfaceClient = createConversationClient(
      { "x-kody-surface-ticket": "signed-ticket" },
      fetcher,
    );

    await surfaceClient.list();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/kody/chat/conversations?surface=global",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-kody-surface-ticket": "signed-ticket",
        }),
      }),
    );
  });

  it("serializes commands for one conversation", async () => {
    const releases: Array<() => void> = [];
    fetcher.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() =>
            resolve(new Response(JSON.stringify({ ok: true }))),
          );
        }),
    );
    const command: ConversationCommand = {
      kind: "update-message",
      actorLogin: "alice",
      entryId: "message-1",
      content: "hello",
      status: "pending",
      updatedAt: "2026-07-20T10:00:00.000Z",
    };

    const first = client.command("c1", command);
    const second = client.command("c1", { ...command, content: "hello world" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    releases[0]();
    await first;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    releases[1]();
    await second;
  });

  it("surfaces a failed persistence request", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
    );

    await expect(client.remove("c1")).rejects.toThrow(
      "Conversation request failed (500)",
    );
  });
});
