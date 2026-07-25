import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOW, validDecision, validIntent } from "../fixtures";
import { setup } from "./helpers";

const TENANT = "acme/app";

describe("intents", () => {
  it("stores intents and their ordered decision history", async () => {
    const t = setup();

    await t.mutation(api.intents.save, {
      tenantId: TENANT,
      intentId: "delivery",
      intent: validIntent({ id: "delivery" }),
      updatedAt: NOW,
    });
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "delivery",
      decision: validDecision({ reason: "first" }),
    });
    await t.mutation(api.intents.appendDecision, {
      tenantId: TENANT,
      intentId: "delivery",
      decision: validDecision({ reason: "second" }),
    });

    expect(
      await t.query(api.intents.get, {
        tenantId: TENANT,
        intentId: "delivery",
      }),
    ).not.toBeNull();
    const decisions = await t.query(api.intents.listDecisions, {
      tenantId: TENANT,
      intentId: "delivery",
    });
    expect(decisions.map((decision) => decision.seq)).toEqual([0, 1]);
  });
});
