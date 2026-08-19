import { describe, expect, it, vi } from "vitest";

import { syncLoopWakeRegistration } from "@dashboard/features/agency/server/loop-wake-registration";

describe("Loop wake registration", () => {
  it("registers only enabled scheduled Loops", async () => {
    const mutation = vi.fn(async () => ({ registered: true, count: 1 }));

    await syncLoopWakeRegistration(
      {
        owner: "acme",
        repo: "widgets",
        loop: {
          id: "ci-health",
          trigger: { type: "schedule", every: "15m" },
          target: { kind: "workflow", id: "ci-health" },
          input: {},
          enabled: true,
        },
      },
      { mutation },
    );

    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "acme/widgets",
      loopId: "ci-health",
      enabled: true,
      updatedAt: expect.any(String),
    });
  });

  it("unregisters disabled and manual Loops", async () => {
    const mutation = vi.fn(async () => ({ registered: false, count: 0 }));

    await syncLoopWakeRegistration(
      {
        owner: "acme",
        repo: "widgets",
        loop: {
          id: "manual-review",
          trigger: { type: "manual" },
          target: { kind: "workflow", id: "review" },
          input: {},
          enabled: true,
        },
      },
      { mutation },
    );

    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loopId: "manual-review", enabled: false }),
    );
  });

  it("unregisters deleted Loops by id", async () => {
    const mutation = vi.fn(async () => ({ registered: false, count: 0 }));

    await syncLoopWakeRegistration(
      { owner: "acme", repo: "widgets", loopId: "ci-health" },
      { mutation },
    );

    expect(mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loopId: "ci-health", enabled: false }),
    );
  });
});
