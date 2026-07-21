import { describe, expect, it } from "vitest";
import type { SessionMeta } from "@dashboard/lib/chat-types";
import {
  mergeHydratedSessions,
  preserveActiveSessionId,
} from "@dashboard/lib/chat/core/conversation/use-conversation-sessions";

function session(id: string, updatedAt: string): SessionMeta {
  return {
    id,
    title: id,
    createdAt: updatedAt,
    updatedAt,
    messageCount: 0,
    pinned: false,
  };
}

describe("conversation hydration", () => {
  it("keeps sessions created while the initial server list was loading", () => {
    const local = session("local-new", "2026-07-21T00:01:00.000Z");
    const remote = session("remote", "2026-07-21T00:00:00.000Z");

    expect(mergeHydratedSessions([remote], [local])).toEqual([local, remote]);
  });

  it("uses refreshed server metadata without duplicating a known session", () => {
    const stale = session("known", "2026-07-21T00:00:00.000Z");
    const refreshed = session("known", "2026-07-21T00:02:00.000Z");

    expect(mergeHydratedSessions([refreshed], [stale])).toEqual([refreshed]);
  });

  it("does not replace a conversation the user already activated", () => {
    expect(preserveActiveSessionId("local-new", "remote")).toBe("local-new");
    expect(preserveActiveSessionId("", "remote")).toBe("remote");
  });
});
