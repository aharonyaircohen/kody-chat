import {
  reduceTerminalSession,
  TerminalSessionTransitionError,
} from "@kody-ade/terminal/terminal-session-state";
import {
  TerminalEventSchema,
  type TerminalEvent,
  type TerminalSession,
  type TerminalSessionInput,
} from "@kody-ade/terminal/terminal-session-model";

import type {
  ChatTerminalConnectionState,
  ChatTerminalTransport,
} from "./types";

export interface TerminalClientSocket {
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface TerminalSessionResponse {
  webSocketUrl: string;
  session: TerminalSessionInput;
}

export type TerminalStartupAction = "setup" | "settings" | "retry";

export interface TerminalStartupIssue {
  code: string;
  message: string;
  action: TerminalStartupAction;
}

export class TerminalSessionRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly action: TerminalStartupAction;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    action: TerminalStartupAction;
  }) {
    super(input.message);
    this.name = "TerminalSessionRequestError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.action = input.action;
  }
}

export interface TerminalSessionClientState {
  connection: ChatTerminalConnectionState;
  session: TerminalSession | null;
  error: string | null;
  issue: TerminalStartupIssue | null;
}

interface TerminalSessionClientOptions {
  chatSessionId: string;
  transport: Exclude<ChatTerminalTransport, { type: "local" }>;
  activityLimit: number | "never" | null;
  getSize: () => { cols: number; rows: number };
  requestSession: (
    body: Record<string, unknown>,
  ) => Promise<TerminalSessionResponse>;
  createSocket: (url: string) => TerminalClientSocket;
  schedule?: (callback: () => void, delayMs: number) => number;
  cancelSchedule?: (id: number) => void;
  onEvent?: (event: TerminalEvent) => void;
  onState?: (state: TerminalSessionClientState) => void;
}

export function shouldSendBrainActivityLimit(
  transport: Exclude<ChatTerminalTransport, { type: "local" }>,
): boolean {
  return (
    transport.type === "brain" ||
    (transport.type === "fly" &&
      (transport.feature === "brain" || transport.feature === undefined))
  );
}

const SOCKET_OPEN = 1;
const MAX_SUBSCRIPTION_RETRIES = 4;
const RETRY_BASE_MS = 750;

function parseMessage(
  raw: string,
):
  | { kind: "event"; event: TerminalEvent }
  | { kind: "pong" }
  | { kind: "rejected"; code?: string; message: string }
  | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "pong") return { kind: "pong" };
    if (record.type === "input-rejected") {
      return {
        kind: "rejected",
        ...(typeof record.code === "string" ? { code: record.code } : {}),
        message:
          typeof record.message === "string"
            ? record.message
            : "Terminal input was rejected",
      };
    }
  }
  const parsed = TerminalEventSchema.safeParse(value);
  return parsed.success ? { kind: "event", event: parsed.data } : null;
}

export class TerminalSessionClient {
  private socket: TerminalClientSocket | null = null;
  private identity: TerminalSessionInput | null = null;
  private session: TerminalSession | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  private connectSequence = 0;
  private stopped = false;
  private startupBlocked = false;
  private state: TerminalSessionClientState = {
    connection: "idle",
    session: null,
    error: null,
    issue: null,
  };

  constructor(private readonly options: TerminalSessionClientOptions) {}

  private schedule(callback: () => void, delayMs: number): number {
    return this.options.schedule
      ? this.options.schedule(callback, delayMs)
      : (globalThis.setTimeout(callback, delayMs) as unknown as number);
  }

  private cancelSchedule(id: number): void {
    if (this.options.cancelSchedule) this.options.cancelSchedule(id);
    else globalThis.clearTimeout(id);
  }

  private publish(
    connection: ChatTerminalConnectionState,
    error: string | null = null,
    issue: TerminalStartupIssue | null = null,
  ): void {
    this.state = { connection, session: this.session, error, issue };
    this.options.onState?.(this.state);
  }

  private requestBody(): Record<string, unknown> {
    const { cols, rows } = this.options.getSize();
    const base = {
      chatSessionId: this.options.chatSessionId,
      ...(this.session ? { afterRevision: this.session.revision } : {}),
      ...(shouldSendBrainActivityLimit(this.options.transport) &&
      this.options.activityLimit !== null
        ? {
            activityLimitMs:
              this.options.activityLimit === "never"
                ? null
                : this.options.activityLimit,
          }
        : {}),
      cols,
      rows,
    };
    const transport = this.options.transport;
    return transport.type === "brain"
      ? { target: "brain", ...base }
      : {
          app: transport.app,
          machineId: transport.machineId,
          feature: transport.feature,
          ...base,
        };
  }

  private clearRetry(): void {
    if (this.retryTimer === null) return;
    this.cancelSchedule(this.retryTimer);
    this.retryTimer = null;
  }

  private canRetry(): boolean {
    return (
      !this.stopped &&
      !this.startupBlocked &&
      this.session?.state !== "exited" &&
      this.session?.state !== "failed"
    );
  }

  private retry(reason: string): void {
    if (!this.canRetry() || this.retryTimer !== null) return;
    if (this.retryCount >= MAX_SUBSCRIPTION_RETRIES) {
      this.publish(
        "error",
        `Terminal subscription failed after ${MAX_SUBSCRIPTION_RETRIES} attempts: ${reason}`,
        {
          code: "terminal_subscription_failed",
          message: `Terminal subscription failed after ${MAX_SUBSCRIPTION_RETRIES} attempts: ${reason}`,
          action: "retry",
        },
      );
      return;
    }
    this.retryCount += 1;
    this.publish("connecting");
    this.retryTimer = this.schedule(
      () => {
        this.retryTimer = null;
        void this.openSubscription();
      },
      RETRY_BASE_MS * 2 ** (this.retryCount - 1),
    );
  }

  private applyEvent(event: TerminalEvent): void {
    if (!this.identity || event.sessionId !== this.identity.id) return;
    try {
      if (!this.session) {
        if (event.type !== "state") return;
        this.session = {
          ...this.identity,
          generation: event.generation,
          state: event.state,
          revision: 0,
        };
      } else {
        this.session = reduceTerminalSession(this.session, {
          type: "event",
          event,
        });
      }
    } catch (error) {
      if (error instanceof TerminalSessionTransitionError) {
        this.publish("error", error.message);
        return;
      }
      throw error;
    }

    this.options.onEvent?.(event);
    if (this.session.state === "ready") {
      this.retryCount = 0;
      this.publish("connected");
    } else if (this.session.state === "detached") {
      this.publish("connecting");
    } else if (this.session.state === "exited") {
      this.clearRetry();
      this.publish("closed");
    } else if (this.session.state === "failed") {
      this.clearRetry();
      this.publish("error", event.type === "failed" ? event.message : null);
    } else {
      this.publish("connecting");
    }
  }

  private async openSubscription(): Promise<void> {
    if (this.stopped) return;
    const sequence = ++this.connectSequence;
    this.publish("connecting");
    try {
      const response = await this.options.requestSession(this.requestBody());
      if (this.stopped || sequence !== this.connectSequence) return;
      if (this.identity && response.session.id !== this.identity.id) {
        throw new Error("Terminal service changed the session identity");
      }
      this.identity = response.session;
      const socket = this.options.createSocket(response.webSocketUrl);
      this.socket?.close(1000, "terminal subscription replaced");
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket || this.stopped) return;
        const { cols, rows } = this.options.getSize();
        socket.send(
          JSON.stringify({
            type: "resize",
            sessionId: this.identity?.id,
            cols,
            rows,
          }),
        );
      };
      socket.onmessage = ({ data }) => {
        if (this.socket !== socket || this.stopped) return;
        const message = parseMessage(data);
        if (!message || message.kind === "pong") return;
        if (message.kind === "rejected") {
          if (!this.session) {
            this.startupBlocked = true;
            this.publish("error", message.message, {
              code: message.code ?? "terminal_agent_unavailable",
              message: message.message,
              action: "setup",
            });
          } else {
            this.publish(this.state.connection, message.message);
          }
          return;
        }
        this.applyEvent(message.event);
      };
      socket.onerror = () => {
        if (this.socket === socket) this.publish("connecting");
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.retry("network connection closed");
      };
    } catch (error) {
      if (this.stopped || sequence !== this.connectSequence) return;
      if (error instanceof TerminalSessionRequestError && !error.retryable) {
        this.startupBlocked = true;
        this.publish("error", error.message, {
          code: error.code,
          message: error.message,
          action: error.action,
        });
        return;
      }
      this.retry(error instanceof Error ? error.message : String(error));
    }
  }

  connect(): Promise<void> {
    this.stopped = false;
    this.startupBlocked = false;
    this.clearRetry();
    return this.openSubscription();
  }

  retryNow(options: { resetSession?: boolean } = {}): Promise<void> {
    if (options.resetSession) {
      this.disconnect();
      this.identity = null;
      this.session = null;
    }
    this.stopped = false;
    this.startupBlocked = false;
    this.retryCount = 0;
    this.clearRetry();
    return this.openSubscription();
  }

  disconnect(): void {
    this.stopped = true;
    this.connectSequence += 1;
    this.clearRetry();
    if (this.socket?.readyState === SOCKET_OPEN && this.identity) {
      this.socket.send(
        JSON.stringify({ type: "detach", sessionId: this.identity.id }),
      );
    }
    this.socket?.close(1000, "terminal view detached");
    this.socket = null;
    this.publish("closed");
  }

  sendInput(inputId: string, data: string): boolean {
    if (
      this.socket?.readyState !== SOCKET_OPEN ||
      !this.identity ||
      this.session?.state !== "ready"
    ) {
      return false;
    }
    this.socket.send(
      JSON.stringify({
        type: "input",
        sessionId: this.identity.id,
        inputId,
        data,
      }),
    );
    return true;
  }

  resize(cols: number, rows: number): boolean {
    if (this.socket?.readyState !== SOCKET_OPEN || !this.identity) return false;
    this.socket.send(
      JSON.stringify({
        type: "resize",
        sessionId: this.identity.id,
        cols,
        rows,
      }),
    );
    return true;
  }

  restart(): boolean {
    if (
      this.socket?.readyState !== SOCKET_OPEN ||
      !this.identity ||
      !this.session
    ) {
      return false;
    }
    const command = { type: "restart" as const, sessionId: this.identity.id };
    try {
      this.session = reduceTerminalSession(this.session, {
        type: "command",
        command,
      });
    } catch (error) {
      if (error instanceof TerminalSessionTransitionError) {
        this.publish("error", error.message);
        return false;
      }
      throw error;
    }
    this.publish("connecting");
    this.socket.send(JSON.stringify(command));
    return true;
  }

  getState(): TerminalSessionClientState {
    return this.state;
  }
}
