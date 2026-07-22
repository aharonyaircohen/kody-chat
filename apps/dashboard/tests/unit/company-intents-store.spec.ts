/**
 * Unit tests for the Convex-backed company intents store
 * (src/dashboard/lib/company-intents-store.ts): intents
 * list/get/save/listDecisions/appendDecision with the right tenantId,
 * decision ordering, and priority sorting.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  appendCompanyIntentDecision,
  listCompanyIntentRecords,
  readCompanyIntentRecord,
  saveCompanyIntent,
} from "@dashboard/lib/company-intents-store";
import { buildCompanyIntent } from "@dashboard/lib/company-intents";

function intentInput(id: string, priority = 100) {
  return buildCompanyIntent({
    id,
    for: "Grow revenue",
    priority,
    posture: "balanced" as const,
    scope: { repos: [], areas: [] },
    principles: [],
    metrics: ["mrr"],
    controls: {
      automation: {
        authority: "full-auto" as const,
        maxConcurrentGoals: 1,
        maxDailyActions: 5,
        requiresHumanFor: [],
      },
    },
    portfolio: { goals: [], loops: [], capabilities: [] },
  });
}

const DECISION = {
  at: "2026-07-01T00:00:00.000Z",
  agent: "kody",
  action: "created",
  reason: "initial setup",
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
});

describe("company intents convex store", () => {
  it("lists intents priority-sorted with seq-ordered decisions", async () => {
    convex.query.mockImplementation(async (ref, args) => {
      const name = getFunctionName(ref);
      if (name === "intents:list") {
        expect(args).toEqual({ tenantId: "acme/widgets" });
        return [
          { intentId: "low", intent: intentInput("low", 200) },
          { intentId: "high", intent: intentInput("high", 10) },
        ];
      }
      if (name === "intents:listDecisions") {
        return [
          { seq: 1, decision: { ...DECISION, reason: "second" } },
          { seq: 0, decision: { ...DECISION, reason: "first" } },
        ];
      }
      throw new Error(`unexpected query ${name}`);
    });

    const records = await listCompanyIntentRecords("acme", "widgets");

    expect(records.map((record) => record.id)).toEqual(["high", "low"]);
    expect(records[0]!.decisions.map((d) => d.reason)).toEqual([
      "first",
      "second",
    ]);
    expect(records[0]!.path).toBe("intents/high/intent.json");
  });

  it("reads one intent via intents.get", async () => {
    convex.query.mockImplementation(async (ref) => {
      const name = getFunctionName(ref);
      if (name === "intents:get") {
        return { intentId: "high", intent: intentInput("high") };
      }
      return [];
    });

    const record = await readCompanyIntentRecord("acme", "widgets", "high");
    expect(record?.intent.for).toBe("Grow revenue");

    const [ref, args] = convex.query.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("intents:get");
    expect(args).toEqual({ tenantId: "acme/widgets", intentId: "high" });
  });

  it("returns null for a missing intent", async () => {
    convex.query.mockResolvedValue(null);
    expect(await readCompanyIntentRecord("acme", "widgets", "nope")).toBeNull();
  });

  it("saves an intent via intents.save with its updatedAt", async () => {
    convex.mutation.mockResolvedValue("id-1");
    const intent = intentInput("high");

    await saveCompanyIntent("acme", "widgets", intent);

    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("intents:save");
    expect(args).toEqual({
      tenantId: "acme/widgets",
      intentId: "high",
      intent,
      updatedAt: intent.updatedAt,
    });
  });

  it("appends a decision via intents.appendDecision", async () => {
    convex.mutation.mockResolvedValue("id-2");

    await appendCompanyIntentDecision("acme", "widgets", "high", DECISION);

    const [ref, args] = convex.mutation.mock.calls[0]!;
    expect(getFunctionName(ref)).toBe("intents:appendDecision");
    expect(args).toEqual({
      tenantId: "acme/widgets",
      intentId: "high",
      decision: DECISION,
    });
  });
});
