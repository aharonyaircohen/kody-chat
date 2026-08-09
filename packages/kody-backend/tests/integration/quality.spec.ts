import { describe, expect, it } from "vitest";

import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/app";
const NOW = "2026-08-09T12:00:00.000Z";

describe("quality", () => {
  it("stores actions, journeys, and scenarios without version records", async () => {
    const t = setup();

    await t.mutation(api.quality.saveAction, {
      tenantId: TENANT,
      slug: "send-message",
      name: "Send a message",
      outcome: "The user sends one chat message.",
      area: "Chat",
      status: "active",
      updatedAt: NOW,
    });
    await t.mutation(api.quality.saveJourney, {
      tenantId: TENANT,
      slug: "direct-chat-persists",
      name: "Direct chat survives reload",
      goal: "A user can return to a saved direct chat.",
      priority: "critical",
      status: "active",
      actionSlugs: ["send-message"],
      updatedAt: NOW,
    });
    await t.mutation(api.quality.saveScenario, {
      tenantId: TENANT,
      slug: "reply-persists",
      journeySlug: "direct-chat-persists",
      name: "Reply persists after reload",
      kind: "persistence",
      given: "A connected repository and configured direct model.",
      expectedVisible: "The same reply is visible after reload.",
      expectedState: "The conversation and messages remain stored.",
      testId: "direct-kody-chat",
      cleanup: "Remove the test conversation.",
      status: "active",
      updatedAt: NOW,
    });

    const map = await t.query(api.quality.getMap, { tenantId: TENANT });
    expect(map.actions).toHaveLength(1);
    expect(map.journeys[0].actionSlugs).toEqual(["send-message"]);
    expect(map.scenarios[0].testId).toBe("direct-kody-chat");
    expect(map.journeys[0]).not.toHaveProperty("version");
  });

  it("refuses to delete referenced definitions", async () => {
    const t = setup();
    await t.mutation(api.quality.saveAction, {
      tenantId: TENANT,
      slug: "send-message",
      name: "Send a message",
      outcome: "The user sends one chat message.",
      area: "Chat",
      status: "active",
      updatedAt: NOW,
    });
    await t.mutation(api.quality.saveJourney, {
      tenantId: TENANT,
      slug: "direct-chat-persists",
      name: "Direct chat survives reload",
      goal: "A user can return to a saved direct chat.",
      priority: "critical",
      status: "active",
      actionSlugs: ["send-message"],
      updatedAt: NOW,
    });

    await expect(
      t.mutation(api.quality.removeAction, {
        tenantId: TENANT,
        slug: "send-message",
      }),
    ).rejects.toThrow(/referenced/i);
  });

  it("keeps Quality Run evidence append-only and idempotent", async () => {
    const t = setup();
    await t.mutation(api.quality.createRun, {
      tenantId: TENANT,
      runId: "run-1",
      runSlug: "reply-persists-20260809",
      journeySlug: "direct-chat-persists",
      scenarioSlug: "reply-persists",
      environment: "local",
      targetUrl: "http://127.0.0.1:3333",
      sourceCommit: "abc123",
      definitionUpdatedAt: NOW,
      createdAt: NOW,
    });
    const event = {
      tenantId: TENANT,
      runId: "run-1",
      idempotencyKey: "runner:started",
      event: { type: "runner_started" },
      time: NOW,
    };
    await t.mutation(api.quality.appendRunEvent, event);
    await t.mutation(api.quality.appendRunEvent, event);

    const detail = await t.query(api.quality.getRun, {
      tenantId: TENANT,
      runId: "run-1",
    });
    expect(detail?.events).toHaveLength(1);
    expect(detail?.run.status).toBe("queued");
    const runs = await t.query(api.quality.listRuns, { tenantId: TENANT });
    expect(runs[0]).toMatchObject({
      runId: "run-1",
      latestEvent: { type: "runner_started" },
    });
  });
});
