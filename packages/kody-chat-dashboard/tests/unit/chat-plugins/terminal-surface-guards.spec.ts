/**
 * @fileoverview Behavior coverage for the terminal surface's connection
 *   guards (Step 5a REWRITE of chat-terminal-surface-timeout.spec.ts, plus
 *   the two behavioral pins split out of chat-terminal-header-style.spec.ts
 *   — restore blocks remote input, web links open in the surface — and the
 *   Brain image mismatch notice from terminal-image-mismatch-ui.spec.ts):
 *   bounded fetches, stale-socket guards, input-ack before "sent",
 *   reconnect on stall, no reopen while restoring.
 * @testFramework vitest
 * @domain chat-plugins
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FLY_RECONNECT_DELAY_MS,
  FLY_RECONNECT_MAX_ATTEMPTS,
  TERMINAL_INPUT_TIMEOUT_MS,
  acknowledgeFlyInput,
  buildFlySessionRequest,
  connectFly,
  fetchWithTimeout,
  inputSignalForConnectionState,
  scheduleFlyReconnect,
  shouldReconnectFlySocket,
  shouldReconnectVisibleRemoteTerminal,
  shouldSkipFlyConnect,
  updateFlyConnectionState,
  waitForFlyInputAck,
  type FlyConnectionDeps,
} from "../../../src/dashboard/lib/chat/plugins/terminal/fly-connection";
import {
  openTerminalWebLink,
  usefulCapturedOutput,
} from "../../../src/dashboard/lib/chat/plugins/terminal/terminal-text";
import { resetTerminalUiForRestart } from "../../../src/dashboard/lib/chat/plugins/terminal/xterm-setup";
import type {
  ChatTerminalConnectionState,
  TerminalInputSignal,
} from "../../../src/dashboard/lib/chat/plugins/terminal/types";

interface DepsHarness {
  ref: { current: FlyConnectionDeps };
  writes: string[];
  signals: TerminalInputSignal[];
  briefSignals: TerminalInputSignal[];
  errors: Array<string | null>;
  states: ChatTerminalConnectionState[];
}

function makeDeps(overrides: Partial<FlyConnectionDeps> = {}): DepsHarness {
  const writes: string[] = [];
  const signals: TerminalInputSignal[] = [];
  const briefSignals: TerminalInputSignal[] = [];
  const errors: Array<string | null> = [];
  const states: ChatTerminalConnectionState[] = [];
  const deps: FlyConnectionDeps = {
    chatSessionId: "chat-1",
    terminalRef: {
      current: {
        cols: 80,
        rows: 24,
        write: (data: string) => void writes.push(data),
        writeln: (data: string) => void writes.push(data),
      },
    },
    fitAddonRef: { current: { fit() {} } },
    transportRef: { current: { type: "brain" } },
    disposedRef: { current: false },
    sessionEndNotifiedRef: { current: false },
    flySocketRef: { current: null },
    flyConnectionStateRef: { current: "idle" },
    flyTargetKeyRef: { current: null },
    flyConnectSeqRef: { current: 0 },
    flyConnectInFlightKeyRef: { current: null },
    flyConnectFailureKeyRef: { current: null },
    flyReconnectTimerRef: { current: null },
    flyReconnectNoticeRef: { current: false },
    flyReconnectAttemptRef: { current: 0 },
    flyReconnectExhaustedRef: { current: false },
    pendingFlyInputAckTimerRef: { current: null },
    setFlyConnectionState: (state) => void states.push(state),
    notifyConnectionState: () => {},
    setError: (error) => void errors.push(error),
    setInputSignal: (signal) => void signals.push(signal),
    setInputSignalBriefly: (signal) => void briefSignals.push(signal),
    appendCapturedOutput: () => {},
    notifyTerminalSessionEnded: () => {},
    ...overrides,
  };
  return {
    ref: { current: deps },
    writes,
    signals,
    briefSignals,
    errors,
    states,
  };
}

function fakeSocket(): WebSocket & { closeCalls: Array<[number?, string?]> } {
  const closeCalls: Array<[number?, string?]> = [];
  return {
    readyState: 1,
    close: (code?: number, reason?: string) =>
      void closeCalls.push([code, reason]),
    closeCalls,
  } as unknown as WebSocket & { closeCalls: Array<[number?, string?]> };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded terminal fetches", () => {
  it("aborts a stuck request after the timeout so it cannot freeze reads", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init: RequestInit) => {
      capturedSignal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });

    const pending = fetchWithTimeout(
      "/api/kody/chat/terminal/output",
      {},
      5_000,
    );
    const assertion = expect(pending).rejects.toThrow("Aborted");
    vi.advanceTimersByTime(5_000);
    await assertion;
    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe("remote input gating", () => {
  it("blocks input while restoring and reopens it only when connected", () => {
    // Restore blocks remote input (was chat-terminal-header-style pin).
    expect(inputSignalForConnectionState("restoring")).toEqual({
      tone: "blocked",
      label: "Restoring terminal",
    });
    expect(inputSignalForConnectionState("connecting")).toEqual({
      tone: "blocked",
      label: "Waiting for terminal",
    });
    expect(inputSignalForConnectionState("connected")).toEqual({
      tone: "ready",
      label: "Ready for input",
    });
    expect(inputSignalForConnectionState("closed")).toEqual({
      tone: "blocked",
      label: "Input blocked",
    });
    expect(inputSignalForConnectionState("error")).toEqual({
      tone: "blocked",
      label: "Input blocked",
    });
    expect(inputSignalForConnectionState("idle")).toBeNull();
  });

  it("clears a pending input-ack timer when the connection closes", () => {
    const harness = makeDeps();
    harness.ref.current.flySocketRef.current = fakeSocket();
    waitForFlyInputAck(harness.ref, 1);
    expect(
      harness.ref.current.pendingFlyInputAckTimerRef.current,
    ).not.toBeNull();
    updateFlyConnectionState(harness.ref, "closed");
    expect(harness.ref.current.pendingFlyInputAckTimerRef.current).toBeNull();
  });
});

describe("terminal restart UI", () => {
  it("leaves alternate-screen modes without deleting scrollback", () => {
    const calls: string[] = [];
    resetTerminalUiForRestart({
      write: (data) => void calls.push(data),
      focus: () => void calls.push("focus"),
    });

    expect(calls).toEqual([
      "\u001b[?1049l\u001b[?2004l\u001b[?1000l\u001b[?1002l\u001b[?1003l\u001b[?1006l\u001b[0m\r\n",
      "focus",
    ]);
  });
});

describe("input acknowledgement before 'sent'", () => {
  it("reports queued first, then sent only on bridge acceptance", () => {
    const harness = makeDeps();
    waitForFlyInputAck(harness.ref, 7);
    expect(harness.signals.at(-1)).toEqual({
      tone: "queued",
      label: "Sending input",
    });

    acknowledgeFlyInput(harness.ref, true);
    expect(harness.ref.current.pendingFlyInputAckTimerRef.current).toBeNull();
    expect(harness.briefSignals.at(-1)).toEqual({
      tone: "sent",
      label: "Input sent",
    });
  });

  it("surfaces a rejection without marking the input sent", () => {
    const harness = makeDeps();
    waitForFlyInputAck(harness.ref, 8);
    acknowledgeFlyInput(harness.ref, false, "tmux said no");

    expect(harness.errors.at(-1)).toBe("tmux said no");
    expect(harness.signals.at(-1)).toEqual({
      tone: "blocked",
      label: "Input blocked",
    });
    expect(harness.writes.at(-1)).toContain("tmux said no");
    expect(harness.briefSignals).toHaveLength(0);
  });

  it("reconnects the socket when the acknowledgement stalls", () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const harness = makeDeps();
    const ws = fakeSocket();
    harness.ref.current.flySocketRef.current = ws;

    waitForFlyInputAck(harness.ref, 9);
    vi.advanceTimersByTime(TERMINAL_INPUT_TIMEOUT_MS);

    // The stall is routed through the one browser WebSocket retry owner.
    expect(harness.errors).toContain("Terminal input stalled; reconnecting.");
    expect(ws.closeCalls).toEqual([
      [4001, "terminal input acknowledgement timed out"],
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLY_RECONNECT_DELAY_MS);
    // The bounded reconnect actually fired a new session request.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/kody/terminal/session",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("stale connect guards", () => {
  it("lets the bridge own startup retries and the browser own established socket recovery", () => {
    expect(
      shouldReconnectFlySocket({ state: "connecting", reconnectAttempt: 0 }),
    ).toBe(false);
    expect(
      shouldReconnectFlySocket({ state: "restoring", reconnectAttempt: 0 }),
    ).toBe(false);
    expect(
      shouldReconnectFlySocket({ state: "connected", reconnectAttempt: 0 }),
    ).toBe(true);
    expect(
      shouldReconnectFlySocket({ state: "connecting", reconnectAttempt: 1 }),
    ).toBe(true);
    expect(
      shouldReconnectFlySocket({ state: "error", reconnectAttempt: 1 }),
    ).toBe(false);
  });

  it("does not let focus events restart an active or failed cold boot", () => {
    expect(shouldReconnectVisibleRemoteTerminal("closed")).toBe(true);
    expect(shouldReconnectVisibleRemoteTerminal("connecting")).toBe(false);
    expect(shouldReconnectVisibleRemoteTerminal("restoring")).toBe(false);
    expect(shouldReconnectVisibleRemoteTerminal("error")).toBe(false);
    expect(shouldReconnectVisibleRemoteTerminal("connected")).toBe(false);
  });

  it("never reopens a remote terminal while the existing connection is restoring", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const harness = makeDeps();
    harness.ref.current.flyTargetKeyRef.current = "brain";
    harness.ref.current.flyConnectionStateRef.current = "restoring";

    await connectFly(harness.ref);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops reconnecting when the repo has no running Brain target", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "machine_not_found",
            message: "Machine not found.",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const harness = makeDeps();
    harness.ref.current.flyReconnectAttemptRef.current = 1;

    await connectFly(harness.ref, { force: true });

    expect(harness.states.at(-1)).toBe("error");
    expect(harness.errors.at(-1)).toBe(
      "No running Brain is selected for this repository. Run a Brain image, then connect again.",
    );
    vi.runAllTimers();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("skips repeat attempts for failed or in-flight keys until forced", () => {
    const base = {
      force: false,
      attemptKey: "chat-1:brain",
      failureKey: null as string | null,
      inFlightKey: null as string | null,
      targetKey: null as string | null,
      connectKey: "brain",
      existingState: "idle" as ChatTerminalConnectionState,
    };
    expect(shouldSkipFlyConnect(base)).toBe(false);
    expect(shouldSkipFlyConnect({ ...base, failureKey: "chat-1:brain" })).toBe(
      true,
    );
    expect(shouldSkipFlyConnect({ ...base, inFlightKey: "chat-1:brain" })).toBe(
      true,
    );
    expect(
      shouldSkipFlyConnect({
        ...base,
        failureKey: "chat-1:brain",
        force: true,
      }),
    ).toBe(false);
    expect(
      shouldSkipFlyConnect({
        ...base,
        targetKey: "brain",
        existingState: "connected",
      }),
    ).toBe(true);
    // A different target is never blocked by the current connection.
    expect(
      shouldSkipFlyConnect({
        ...base,
        targetKey: "fly:app:m1",
        existingState: "connected",
      }),
    ).toBe(false);
  });

  it("schedules a single-notice reconnect and retries after the delay", () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const harness = makeDeps();
    const ws = fakeSocket();
    harness.ref.current.flySocketRef.current = ws;

    scheduleFlyReconnect(harness.ref);
    scheduleFlyReconnect(harness.ref);

    const notices = harness.writes.filter((line) =>
      line.includes("Terminal connection interrupted; reconnecting."),
    );
    expect(notices).toHaveLength(1);
    expect(ws.closeCalls[0]?.[0]).toBe(4001);
    expect(harness.signals.at(-1)).toEqual({
      tone: "blocked",
      label: "Reconnecting terminal",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLY_RECONNECT_DELAY_MS);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/kody/terminal/session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stops reconnecting after the bounded attempts and preserves the final reason", () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const harness = makeDeps();

    for (let attempt = 0; attempt < FLY_RECONNECT_MAX_ATTEMPTS; attempt += 1) {
      scheduleFlyReconnect(harness.ref, "WebSocket closed with code 1006");
      vi.advanceTimersByTime(FLY_RECONNECT_DELAY_MS * 2 ** attempt);
    }

    expect(fetchSpy).toHaveBeenCalledTimes(FLY_RECONNECT_MAX_ATTEMPTS);
    scheduleFlyReconnect(harness.ref, "WebSocket closed with code 1006");
    expect(harness.states.at(-1)).toBe("error");
    expect(harness.errors.at(-1)).toBe(
      "Terminal connection failed after 3 reconnect attempts: WebSocket closed with code 1006",
    );
    scheduleFlyReconnect(harness.ref, "WebSocket closed with code 1006");
    expect(
      harness.errors.filter((message) =>
        message?.startsWith("Terminal connection failed after"),
      ),
    ).toHaveLength(1);
    vi.runAllTimers();
    expect(fetchSpy).toHaveBeenCalledTimes(FLY_RECONNECT_MAX_ATTEMPTS);
  });
});

describe("Brain session request", () => {
  it("targets Brain semantically and Fly machines by id, with activity limits", () => {
    expect(
      buildFlySessionRequest({
        transport: { type: "brain" },
        chatSessionId: "chat-1",
        activityLimit: 300_000,
        cols: 80,
        rows: 24,
      }),
    ).toEqual({
      target: "brain",
      chatSessionId: "chat-1",
      resetSession: undefined,
      activityLimitMs: 300_000,
      cols: 80,
      rows: 24,
    });
    // "never" maps to an explicit null; runner machines get no limit.
    expect(
      buildFlySessionRequest({
        transport: { type: "brain" },
        chatSessionId: "chat-1",
        activityLimit: "never",
        cols: 80,
        rows: 24,
      }),
    ).toMatchObject({ activityLimitMs: null });
    expect(
      buildFlySessionRequest({
        transport: {
          type: "fly",
          app: "runner-app",
          machineId: "m-1",
          feature: "runner",
        },
        chatSessionId: "chat-1",
        resetSession: true,
        activityLimit: 300_000,
        cols: 80,
        rows: 24,
      }),
    ).toEqual({
      app: "runner-app",
      machineId: "m-1",
      feature: "runner",
      chatSessionId: "chat-1",
      resetSession: true,
      cols: 80,
      rows: 24,
    });
  });
});

describe("terminal web links", () => {
  it("opens links in an opener-less tab from the terminal surface", () => {
    const opened = { opener: {} as unknown };
    const openWindow = vi.fn(() => opened as Window & { opener: unknown });
    openTerminalWebLink("https://example.com", openWindow);
    expect(openWindow).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer",
    );
    expect(opened.opener).toBeNull();
  });
});

describe("captured output", () => {
  it("keeps only the useful tail of terminal output", () => {
    const noisy = "\u001b[31mred\u001b[0m\r\n\r\n  line two  \r\n";
    expect(usefulCapturedOutput(noisy)).toBe("red\n  line two");
  });
});
