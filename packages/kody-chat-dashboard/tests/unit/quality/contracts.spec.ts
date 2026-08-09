import { describe, expect, it } from "vitest";

import {
  actionSchema,
  journeySchema,
  qualityRunHealth,
  scenarioSchema,
} from "../../../src/dashboard/lib/quality/contracts";

const NOW = "2026-08-09T12:00:00.000Z";

describe("quality contracts", () => {
  it("models reusable actions without version numbers", () => {
    const action = actionSchema.parse({
      slug: "send-message",
      name: "Send a message",
      outcome: "The user sends one chat message.",
      area: "Chat",
      status: "active",
      updatedAt: NOW,
    });

    expect(action.slug).toBe("send-message");
    expect(action).not.toHaveProperty("version");
  });

  it("keeps a journey as an ordered list of action references", () => {
    const journey = journeySchema.parse({
      slug: "direct-chat-persists",
      name: "Direct chat survives reload",
      goal: "A user can return to a saved direct chat.",
      priority: "critical",
      status: "active",
      actionSlugs: ["open-chat", "send-message", "reload-chat"],
      updatedAt: NOW,
    });

    expect(journey.actionSlugs).toEqual([
      "open-chat",
      "send-message",
      "reload-chat",
    ]);
  });

  it("requires an executable test for an active scenario", () => {
    expect(() =>
      scenarioSchema.parse({
        slug: "reply-persists",
        journeySlug: "direct-chat-persists",
        name: "Reply persists after reload",
        kind: "persistence",
        given: "A connected repository and configured direct model.",
        expectedVisible: "The same reply is visible after reload.",
        expectedState: "The conversation and messages remain stored.",
        status: "active",
        updatedAt: NOW,
      }),
    ).toThrow();
  });

  it("marks proof stale when its definition changed after the pass", () => {
    expect(
      qualityRunHealth({
        scenarioStatus: "active",
        scenarioUpdatedAt: "2026-08-09T12:01:00.000Z",
        latestRun: {
          status: "passed",
          definitionUpdatedAt: NOW,
          sourceCommit: "abc123",
        },
        targetCommit: "abc123",
      }),
    ).toBe("stale");
  });

  it("marks proof stale when it targets another source commit", () => {
    expect(
      qualityRunHealth({
        scenarioStatus: "active",
        scenarioUpdatedAt: NOW,
        latestRun: {
          status: "passed",
          definitionUpdatedAt: NOW,
          sourceCommit: "abc123",
        },
        targetCommit: "def456",
      }),
    ).toBe("stale");
  });
});
