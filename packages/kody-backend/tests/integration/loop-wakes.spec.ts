import { describe, expect, it } from "vitest";

import { api, internal } from "../../convex/_generated/api";
import { setupWithoutKey, TEST_SERVICE_KEY } from "./helpers";

const NOW = "2026-08-19T12:00:00.000Z";
const SLOT = "2026-08-19T12:00:00.000Z";

async function sync(
  t: ReturnType<typeof setupWithoutKey>,
  input: { tenantId: string; loopId: string; enabled: boolean },
) {
  return t.mutation(api.loopWakes.syncRegistration, {
    serviceKey: TEST_SERVICE_KEY,
    updatedAt: NOW,
    ...input,
  });
}

describe("Convex-owned Loop wakes", () => {
  it("claims one repository wake per time slot even when it has several Loops", async () => {
    const t = setupWithoutKey();
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: true,
    });
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "docs-health",
      enabled: true,
    });

    await expect(
      t.mutation(internal.loopWakes.claimDue, {
        slot: SLOT,
        now: NOW,
        limit: 25,
      }),
    ).resolves.toEqual([
      {
        tenantId: "acme/widgets",
        wakeId: `loop-wake:acme/widgets:${SLOT}`,
      },
    ]);

    await expect(
      t.mutation(internal.loopWakes.claimDue, {
        slot: SLOT,
        now: NOW,
        limit: 25,
      }),
    ).resolves.toEqual([]);
  });

  it("stops waking a repository after its final scheduled Loop is disabled", async () => {
    const t = setupWithoutKey();
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: true,
    });
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: false,
    });

    await expect(
      t.mutation(internal.loopWakes.claimDue, {
        slot: SLOT,
        now: NOW,
        limit: 25,
      }),
    ).resolves.toEqual([]);
  });

  it("records dispatch outcomes without exposing credentials", async () => {
    const t = setupWithoutKey();
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: true,
    });
    const [claim] = await t.mutation(internal.loopWakes.claimDue, {
      slot: SLOT,
      now: NOW,
      limit: 25,
    });

    await t.mutation(internal.loopWakes.finishWake, {
      tenantId: claim!.tenantId,
      wakeId: claim!.wakeId,
      status: "dispatched",
      detail: "runner accepted",
      now: "2026-08-19T12:00:01.000Z",
    });

    const receipt = await t.run(async (ctx) =>
      ctx.db
        .query("loopWakeReceipts")
        .withIndex("by_wake", (q) =>
          q.eq("tenantId", claim!.tenantId).eq("wakeId", claim!.wakeId),
        )
        .unique(),
    );
    expect(receipt).toMatchObject({
      tenantId: "acme/widgets",
      status: "dispatched",
      detail: "runner accepted",
    });
    expect(JSON.stringify(receipt)).not.toContain("secret");
  });

  it("allows the next time slot after a failed wake", async () => {
    const t = setupWithoutKey();
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: true,
    });
    const [claim] = await t.mutation(internal.loopWakes.claimDue, {
      slot: SLOT,
      now: NOW,
      limit: 25,
    });
    await t.mutation(internal.loopWakes.finishWake, {
      tenantId: claim!.tenantId,
      wakeId: claim!.wakeId,
      status: "failed",
      detail: "pool unavailable",
      now: "2026-08-19T12:00:01.000Z",
    });

    await expect(
      t.mutation(internal.loopWakes.claimDue, {
        slot: "2026-08-19T12:15:00.000Z",
        now: "2026-08-19T12:15:00.000Z",
        limit: 25,
      }),
    ).resolves.toHaveLength(1);
  });

  it("replaces registrations from an Engine shadow tick", async () => {
    const t = setupWithoutKey();
    await sync(t, {
      tenantId: "acme/widgets",
      loopId: "old-loop",
      enabled: true,
    });

    await t.mutation(api.loopWakes.replaceRegistrations, {
      serviceKey: TEST_SERVICE_KEY,
      tenantId: "acme/widgets",
      loopIds: ["ci-health", "docs-health", "ci-health"],
      updatedAt: NOW,
    });

    const registrations = await t.run(async (ctx) =>
      ctx.db
        .query("loopWakeRegistrations")
        .withIndex("by_tenant", (q) => q.eq("tenantId", "acme/widgets"))
        .collect(),
    );
    expect(registrations.map((row) => row.loopId).sort()).toEqual([
      "ci-health",
      "docs-health",
    ]);
  });
});
