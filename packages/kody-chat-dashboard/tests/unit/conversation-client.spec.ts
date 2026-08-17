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

  it("supports removing a durable message", async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await client.command("c1", {
      kind: "remove-message",
      actorLogin: "alice",
      entryId: "guided-flow-1",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/kody/chat/conversations/c1/commands",
      expect.objectContaining({
        body: JSON.stringify({
          kind: "remove-message",
          actorLogin: "alice",
          entryId: "guided-flow-1",
        }),
      }),
    );
  });

  it("waits for a new conversation to finish saving before deleting it", async () => {
    const releases: Array<() => void> = [];
    fetcher.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          releases.push(() =>
            resolve(new Response(JSON.stringify({ ok: true }))),
          );
        }),
    );

    const created = client.create({ conversationId: "new-conversation" });
    const deleted = client.remove("new-conversation");

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/kody/chat/conversations",
      expect.objectContaining({ method: "POST" }),
    );

    releases[0]();
    await created;
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/kody/chat/conversations/new-conversation",
      expect.objectContaining({ method: "DELETE" }),
    );

    releases[1]();
    await deleted;
  });

  it("surfaces a failed persistence request", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
    );

    await expect(client.remove("c1")).rejects.toThrow(
      "Conversation request failed (500)",
    );
  });

  it("surfaces a useful server persistence error", async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "GitHub is temporarily unavailable. Try again shortly.",
        }),
        { status: 503 },
      ),
    );

    await expect(client.remove("c1")).rejects.toThrow(
      "GitHub is temporarily unavailable. Try again shortly.",
    );
  });

  it("serializes machine access as its own conversation command", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await client.command("c1", {
      kind: "machine-access",
      actorLogin: "alice",
      machineAccess: "local",
      updatedAt: "2026-07-20T10:00:00.000Z",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      kind: "machine-access",
      actorLogin: "alice",
      machineAccess: "local",
      updatedAt: "2026-07-20T10:00:00.000Z",
    });
    expect(body).not.toHaveProperty("runtime");
    expect(body).not.toHaveProperty("agent");
  });

  it("keeps a selected model save alive during a hard refresh", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await client.command("c1", {
      kind: "runtime",
      actorLogin: "alice",
      runtime: { kind: "direct", modelId: "kody:openrouter-free" },
      updatedAt: "2026-08-10T10:00:00.000Z",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/kody/chat/conversations/c1/commands",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      }),
    );
  });

  it("keeps a pending assistant turn save alive during a hard refresh", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await client.command("c1", {
      kind: "append-message",
      actorLogin: "alice",
      entryId: "assistant:turn-1",
      idempotencyKey: "assistant:turn-1",
      role: "assistant",
      agent: { slug: "kody", title: "Kody" },
      content: "",
      status: "pending",
      turnId: "turn-1",
      createdAt: "2026-08-11T10:00:00.000Z",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/kody/chat/conversations/c1/commands",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      }),
    );
  });
});
