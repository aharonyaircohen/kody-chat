/**
 * Unit tests for the system-event emitter and sink registry
 * (src/dashboard/lib/events/emit.ts, sink-registry.ts): envelope shape,
 * invalid-payload drop, sink fan-out, and sink failure isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@dashboard/lib/logger", () => ({ logger: h.logger }));
// `after()` is only available inside a real request scope — force the
// emitter down its direct-dispatch fallback path.
vi.mock("next/server", () => ({
  after: () => {
    throw new Error("no request scope");
  },
}));
vi.mock("@dashboard/lib/state-repo", () => ({
  readStateText: vi.fn(),
  writeStateText: vi.fn(),
}));
vi.mock("@dashboard/lib/auth/background-token", () => ({
  resolveBackgroundToken: vi.fn().mockResolvedValue(null),
}));
vi.mock("@dashboard/lib/github-client", () => ({
  createUserOctokit: vi.fn(),
}));

import {
  emitSystemEvent,
  _resetDefaultSinkRegistration,
} from "@dashboard/lib/events/emit";
import {
  registerSystemEventSink,
  _resetSystemEventSinks,
} from "@dashboard/lib/events/sink-registry";
import type { SystemEventEnvelope } from "@dashboard/lib/events/types";

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetSystemEventSinks();
  // Keep default sinks out of the way: mark them registered without adding.
  _resetDefaultSinkRegistration();
});

function captureSink(name = "capture") {
  const received: SystemEventEnvelope[] = [];
  registerSystemEventSink({
    name,
    async handle(events) {
      received.push(...events);
    },
  });
  return received;
}

describe("emitSystemEvent", () => {
  it("wraps the payload in a full envelope", async () => {
    const received = captureSink();
    emitSystemEvent(
      "page.viewed",
      { path: "/models" },
      {
        userId: "operator:aguy",
        sessionId: "s-9",
        brand: { owner: "acme", repo: "shop" },
        source: "client",
      },
    );
    await flushAsync();

    expect(received).toHaveLength(1);
    const event = received[0];
    expect(event.name).toBe("page.viewed");
    expect(event.version).toBe(1);
    expect(event.userId).toBe("operator:aguy");
    expect(event.sessionId).toBe("s-9");
    expect(event.brand).toEqual({ owner: "acme", repo: "shop" });
    expect(event.source).toBe("client");
    expect(event.payload).toEqual({ path: "/models" });
    expect(event.id.length).toBeGreaterThan(8);
    expect(new Date(event.occurredAt).getTime()).not.toBeNaN();
  });

  it("drops invalid payloads with a warning and never throws", async () => {
    const received = captureSink();
    expect(() =>
      emitSystemEvent(
        "page.viewed",
        // Missing required `path`.
        {} as never,
        { source: "server" },
      ),
    ).not.toThrow();
    await flushAsync();

    expect(received).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "page.viewed" }),
      expect.stringContaining("invalid payload"),
    );
  });

  it("fans out to every sink and isolates a throwing sink", async () => {
    registerSystemEventSink({
      name: "broken",
      async handle() {
        throw new Error("sink exploded");
      },
    });
    const received = captureSink("healthy");

    emitSystemEvent("session.ended", { sessionId: "s-1" }, { source: "server" });
    await flushAsync();

    expect(received).toHaveLength(1);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sink: "broken" }),
      expect.stringContaining("sink failed"),
    );
  });

  it("registers a sink only once per name", async () => {
    const received = captureSink("dupe");
    registerSystemEventSink({
      name: "dupe",
      async handle(events) {
        received.push(...events);
      },
    });

    emitSystemEvent("session.started", { sessionId: "s-2" }, { source: "server" });
    await flushAsync();

    expect(received).toHaveLength(1);
  });
});
