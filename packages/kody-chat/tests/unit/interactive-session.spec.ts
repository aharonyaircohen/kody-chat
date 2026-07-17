import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const mutation = vi.fn();

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({ query, mutation }),
}));

import {
  appendUserTurn,
  buildMetaLine,
  readSessionTranscript,
  writeSessionMeta,
} from "@dashboard/lib/interactive-session";

const META = buildMetaLine({ idleExitMs: 120_000, hardCapMs: 300_000 });
const TURN = {
  role: "user" as const,
  content: "hello",
  timestamp: "2025-01-01T00:00:00.000Z",
};

describe("Convex-backed interactive sessions", () => {
  beforeEach(() => {
    query.mockReset();
    mutation.mockReset().mockResolvedValue("id");
  });

  it("stores session metadata and the optional initial turn", async () => {
    await writeSessionMeta({} as never, "o", "r", "sess-1", META, undefined, undefined, TURN);
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls[0]?.[1]).toMatchObject({
      tenantId: "o/r",
      sessionId: "sess-1",
      meta: META,
    });
    expect(mutation.mock.calls[1]?.[1]).toMatchObject({
      tenantId: "o/r",
      sessionId: "sess-1",
      turn: TURN,
    });
  });

  it("appends a turn and returns the Convex turn count", async () => {
    query.mockResolvedValue([{}, {}]);
    await expect(appendUserTurn({} as never, "o", "r", "sess-2", TURN)).resolves.toEqual({ turnCount: 2 });
    expect(mutation.mock.calls[0]?.[1]).toMatchObject({
      tenantId: "o/r",
      sessionId: "sess-2",
      turn: TURN,
    });
  });

  it("reads the ordered Convex transcript", async () => {
    query.mockResolvedValue({
      session: { meta: META },
      turns: [{ seq: 1, turn: { ...TURN, content: "second" } }, { seq: 0, turn: TURN }],
    });
    await expect(readSessionTranscript("o", "r", "sess-3")).resolves.toEqual({
      meta: META,
      turns: [TURN, { ...TURN, content: "second" }],
    });
  });

  it("returns null for an unknown session", async () => {
    query.mockResolvedValue(null);
    await expect(readSessionTranscript("o", "r", "missing")).resolves.toBeNull();
  });
});
