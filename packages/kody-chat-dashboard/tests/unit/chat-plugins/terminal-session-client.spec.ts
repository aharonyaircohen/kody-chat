import { describe, expect, it, vi } from "vitest";

import {
  TerminalSessionClient,
  TerminalSessionRequestError,
  type TerminalClientSocket,
} from "../../../src/dashboard/lib/chat/plugins/terminal/terminal-session-client";

class FakeSocket implements TerminalClientSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  message(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const requests: Array<Record<string, unknown>> = [];
  const events: unknown[] = [];
  const states: unknown[] = [];
  const client = new TerminalSessionClient({
    chatSessionId: "conversation-1",
    transport: { type: "brain", label: "Brain" },
    activityLimit: null,
    getSize: () => ({ cols: 120, rows: 36 }),
    requestSession: async (body) => {
      requests.push(body);
      return {
        webSocketUrl: "wss://gateway.test/socket",
        session: {
          id: "terminal-1",
          scope: {
            owner: "acme",
            repo: "widgets",
            conversationId: "conversation-1",
          },
          target: { kind: "brain", runtimeId: "brain-1" },
        },
      };
    },
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    schedule: (callback) => {
      callback();
      return 1;
    },
    cancelSchedule: () => {},
    onEvent: (event) => events.push(event),
    onState: (state) => states.push(state),
  });
  return { client, sockets, requests, events, states };
}

describe("TerminalSessionClient", () => {
  it("clears the connected shell with a typed command, without injecting input or restarting", async () => {
    const harness = setup();
    expect(harness.client.clear()).toBe(false);
    await harness.client.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    expect(harness.client.clear()).toBe(true);
    expect(JSON.parse(harness.sockets[0]!.sent.at(-1)!)).toEqual({
      type: "clear",
      sessionId: "terminal-1",
    });
    expect(harness.client.sendInput("input-after-clear", "ls\r")).toBe(true);
  });

  it("accepts the replacement machine after successful setup without carrying the old revision", async () => {
    const sockets: FakeSocket[] = [];
    const requests: Array<Record<string, unknown>> = [];
    const client = new TerminalSessionClient({
      chatSessionId: "conversation-1",
      transport: { type: "brain", label: "Brain" },
      activityLimit: null,
      getSize: () => ({ cols: 80, rows: 24 }),
      requestSession: async (body) => {
        requests.push(body);
        return {
          webSocketUrl: "wss://gateway.test/socket",
          session: {
            id: `terminal-${requests.length}`,
            scope: {
              owner: "acme",
              repo: "widgets",
              conversationId: "conversation-1",
            },
            target: { kind: "brain", runtimeId: `brain-${requests.length}` },
          },
        };
      },
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      schedule: () => 1,
      cancelSchedule: () => {},
    });
    await client.connect();
    sockets[0]!.open();
    sockets[0]!.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    sockets[0]!.message({
      type: "output",
      sessionId: "terminal-1",
      generation: 1,
      revision: 7,
      data: "old screen",
    });
    await client.retryNow({ resetSession: true });
    expect(requests[1]).not.toHaveProperty("afterRevision");
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    sockets[1]!.message({
      type: "state",
      sessionId: "terminal-2",
      generation: 1,
      state: "ready",
    });
    expect(client.sendInput("input-new", "pwd\r")).toBe(true);
  });
  it("reattaches the same session and revision after a socket loss", async () => {
    const harness = setup();
    await harness.client.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    harness.sockets[0]?.message({
      type: "output",
      sessionId: "terminal-1",
      generation: 1,
      revision: 4,
      data: "screen",
    });

    harness.sockets[0]?.drop();
    await vi.waitFor(() => expect(harness.requests).toHaveLength(2));

    expect(harness.requests[1]).toMatchObject({
      target: "brain",
      chatSessionId: "conversation-1",
      afterRevision: 4,
    });
    expect(harness.requests[1]).not.toHaveProperty("resetSession");
  });

  it("does not reconnect or restart an exited process", async () => {
    const harness = setup();
    await harness.client.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });
    harness.sockets[0]?.message({
      type: "exited",
      sessionId: "terminal-1",
      generation: 1,
      code: 0,
    });

    harness.sockets[0]?.drop();
    await Promise.resolve();

    expect(harness.requests).toHaveLength(1);
    expect(
      harness.sockets[0]?.sent.some((raw) => raw.includes("restart")),
    ).toBe(false);
  });

  it("sends restart only as an explicit typed command", async () => {
    const harness = setup();
    await harness.client.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });

    expect(harness.client.restart()).toBe(true);
    expect(JSON.parse(harness.sockets[0]?.sent.at(-1) ?? "{}")).toEqual({
      type: "restart",
      sessionId: "terminal-1",
    });
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 2,
      state: "ready",
    });
    expect(harness.client.getState()).toMatchObject({
      connection: "connected",
      session: { generation: 2, state: "ready", revision: 0 },
    });
    expect(harness.requests).toHaveLength(1);
  });

  it("binds input and resize commands to the authoritative session", async () => {
    const harness = setup();
    await harness.client.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.message({
      type: "state",
      sessionId: "terminal-1",
      generation: 1,
      state: "ready",
    });

    expect(harness.client.sendInput("input-1", "codex\r")).toBe(true);
    expect(harness.client.resize(90, 28)).toBe(true);
    expect(harness.sockets[0]?.sent.map((raw) => JSON.parse(raw))).toEqual(
      expect.arrayContaining([
        {
          type: "input",
          sessionId: "terminal-1",
          inputId: "input-1",
          data: "codex\r",
        },
        { type: "resize", sessionId: "terminal-1", cols: 90, rows: 28 },
      ]),
    );
  });

  it("stops retrying when explicit terminal setup is required", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const states: Array<ReturnType<TerminalSessionClient["getState"]>> = [];
    const client = new TerminalSessionClient({
      chatSessionId: "conversation-1",
      transport: { type: "brain" },
      activityLimit: null,
      getSize: () => ({ cols: 120, rows: 36 }),
      requestSession: async (body) => {
        requests.push(body);
        throw new TerminalSessionRequestError({
          code: "terminal_gateway_not_ready",
          message: "Terminal setup is required for this Brain.",
          retryable: false,
          action: "setup",
        });
      },
      createSocket: () => new FakeSocket(),
      schedule: () => {
        throw new Error("non-retryable errors must not schedule reconnects");
      },
      onState: (state) => states.push(state),
    });

    await client.connect();

    expect(requests).toHaveLength(1);
    expect(states.at(-1)).toMatchObject({
      connection: "error",
      issue: {
        code: "terminal_gateway_not_ready",
        action: "setup",
      },
    });
  });

  it("allows an explicit retry after a startup failure", async () => {
    let attempts = 0;
    const socket = new FakeSocket();
    const client = new TerminalSessionClient({
      chatSessionId: "conversation-1",
      transport: { type: "brain" },
      activityLimit: null,
      getSize: () => ({ cols: 120, rows: 36 }),
      requestSession: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new TerminalSessionRequestError({
            code: "fly_access_denied",
            message: "Fly token cannot access this Brain app.",
            retryable: false,
            action: "settings",
          });
        }
        return {
          webSocketUrl: "wss://gateway.test/socket",
          session: {
            id: "terminal-1",
            scope: {
              owner: "acme",
              repo: "widgets",
              conversationId: "conversation-1",
            },
            target: { kind: "brain", runtimeId: "brain-1" },
          },
        };
      },
      createSocket: () => socket,
    });

    await client.connect();
    expect(client.getState().issue?.action).toBe("settings");

    await client.retryNow();
    expect(attempts).toBe(2);
    expect(client.getState().connection).toBe("connecting");
  });
});
