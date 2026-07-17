/**
 * Unit tests for the Convex transcript record in
 * src/dashboard/lib/interactive-session.ts: session start upserts
 * chatSessions (+ initial turn), appended turns land in chatTurns, reads go
 * through chatSessions.get, and a Convex outage never fails the chat write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import {
  appendUserTurn,
  buildMetaLine,
  readSessionTranscript,
  writeSessionMeta,
} from "@dashboard/lib/interactive-session";

/** Octokit double: getContent 404 (new file), create always succeeds. */
function makeOctokit() {
  return {
    repos: {
      getContent: vi.fn(async () => {
        const err = new Error("not found") as Error & { status: number };
        err.status = 404;
        throw err;
      }),
      createOrUpdateFileContents: vi.fn(async () => ({ data: {} })),
    },
    git: {
      getRef: vi.fn(async () => ({ data: { object: { sha: "state-sha" } } })),
      createRef: vi.fn(),
    },
  } as unknown as Octokit;
}

const META = buildMetaLine({ idleExitMs: 60_000 });
const TURN = {
  role: "user" as const,
  content: "hello",
  timestamp: "2026-07-15T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  convex.mutation.mockResolvedValue("id");
});

describe("writeSessionMeta convex record", () => {
  it("upserts the session meta under the owner/repo tenant", async () => {
    await writeSessionMeta(makeOctokit(), "acme", "widgets", "s1", META);

    expect(convex.mutation).toHaveBeenCalledTimes(1);
    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatSessions:upsert");
    expect(args).toMatchObject({
      tenantId: "acme/widgets",
      sessionId: "s1",
      meta: META,
    });
    expect(typeof args.updatedAt).toBe("string");
  });

  it("records the initial turn in the same start", async () => {
    await writeSessionMeta(
      makeOctokit(),
      "acme",
      "widgets",
      "s1",
      META,
      "main",
      4,
      TURN,
    );

    expect(convex.mutation).toHaveBeenCalledTimes(2);
    const [ref, args] = convex.mutation.mock.calls[1]!;
    expect(getFunctionName(ref)).toBe("chatTurns:append");
    expect(args).toEqual({
      tenantId: "acme/widgets",
      sessionId: "s1",
      turn: { ...TURN, toolCalls: [] },
    });
  });

  it("does not fail the session start when Convex is down", async () => {
    convex.mutation.mockRejectedValue(new Error("convex down"));

    await expect(
      writeSessionMeta(makeOctokit(), "acme", "widgets", "s1", META),
    ).resolves.toBeUndefined();
  });
});

describe("appendUserTurn convex record", () => {
  it("appends the turn to chatTurns", async () => {
    convex.query.mockResolvedValue([{ seq: 0, turn: TURN }]);
    const result = await appendUserTurn(
      makeOctokit(),
      "acme",
      "widgets",
      "s1",
      TURN,
    );

    expect(result.turnCount).toBe(1);
    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatTurns:append");
    expect(args.turn).toEqual({ ...TURN, toolCalls: [] });
  });
});

describe("legacy dual-write gate (KODY_LEGACY_SESSION_WRITE)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips the GitHub write on session start when the flag is '0'", async () => {
    vi.stubEnv("KODY_LEGACY_SESSION_WRITE", "0");
    const octokit = makeOctokit();

    await writeSessionMeta(octokit, "acme", "widgets", "s1", META);

    const repos = (octokit as unknown as { repos: Record<string, unknown> })
      .repos as { createOrUpdateFileContents: ReturnType<typeof vi.fn> };
    expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    // Convex record still lands.
    const [ref] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatSessions:upsert");
  });

  it("skips the GitHub write on append and counts turns from Convex", async () => {
    vi.stubEnv("KODY_LEGACY_SESSION_WRITE", "0");
    convex.query.mockResolvedValue([{ seq: 0, turn: TURN }]);
    const octokit = makeOctokit();

    const result = await appendUserTurn(octokit, "acme", "widgets", "s1", TURN);

    const repos = (octokit as unknown as { repos: Record<string, unknown> })
      .repos as {
      createOrUpdateFileContents: ReturnType<typeof vi.fn>;
      getContent: ReturnType<typeof vi.fn>;
    };
    expect(repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    expect(repos.getContent).not.toHaveBeenCalled();
    const [ref] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatTurns:append");
    expect(result.turnCount).toBe(1);
  });

  it("keeps the GitHub write when the flag is unset", async () => {
    vi.stubEnv("KODY_LEGACY_SESSION_WRITE", "1");
    const octokit = makeOctokit();
    await writeSessionMeta(octokit, "acme", "widgets", "s1", META);
    const repos = (octokit as unknown as { repos: Record<string, unknown> })
      .repos as { createOrUpdateFileContents: ReturnType<typeof vi.fn> };
    expect(repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
  });
});

describe("readSessionTranscript", () => {
  it("returns meta plus turns ordered by seq", async () => {
    convex.query.mockResolvedValue({
      session: { meta: META },
      turns: [
        { seq: 1, turn: { ...TURN, content: "second" } },
        { seq: 0, turn: TURN },
      ],
    });

    const result = await readSessionTranscript("acme", "widgets", "s1");

    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("chatSessions:get");
    expect(args).toEqual({ tenantId: "acme/widgets", sessionId: "s1" });
    expect(result?.meta).toEqual(META);
    expect(result?.turns.map((t) => t.content)).toEqual(["hello", "second"]);
  });

  it("returns null for unknown sessions", async () => {
    convex.query.mockResolvedValue(null);
    expect(await readSessionTranscript("acme", "widgets", "nope")).toBeNull();
  });
});
