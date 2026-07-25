import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { setup } from "./helpers";

const TENANT = "acme/app";
const NOW = "2026-07-25T00:00:00.000Z";

describe("goals", () => {
  it("stores tenant-scoped goal state with optimistic concurrency", async () => {
    const t = setup();

    await t.mutation(api.goals.save, {
      tenantId: TENANT,
      goalId: "ci-health",
      state: { state: "active" },
      updatedAt: NOW,
    });

    expect(await t.query(api.goals.list, { tenantId: TENANT })).toHaveLength(1);
    expect(
      await t.query(api.goals.list, { tenantId: "other/tenant" }),
    ).toHaveLength(0);

    await expect(
      t.mutation(api.goals.save, {
        tenantId: TENANT,
        goalId: "ci-health",
        state: { state: "done" },
        updatedAt: "2026-07-25T01:00:00.000Z",
        expectedUpdatedAt: "stale",
      }),
    ).rejects.toThrow("Goal state changed since it was read");
  });
});
