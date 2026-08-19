import { describe, expect, it, vi } from "vitest";

import {
  buildLoopWakeRequest,
  dispatchLoopWakeToDashboard,
} from "../../src/loop-wake-dispatch";

describe("Loop wake Dashboard dispatch", () => {
  it("builds the canonical scheduled fan-out request without credentials", () => {
    const job = buildLoopWakeRequest({
      tenantId: "acme/widgets",
      wakeId: "wake-1",
    });

    expect(job).toEqual({
      jobId: "wake-1",
      repo: "acme/widgets",
      runRequest: {
        requestId: "wake-1",
        target: { type: "workflow", id: "scheduled-fanout" },
        intent: "tick",
        source: "schedule",
      },
    });
    expect(JSON.stringify(job)).not.toMatch(/token|secret|key/i);
  });

  it("uses authenticated HTTPS and returns only a safe result", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, machineId: "machine-1" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      dispatchLoopWakeToDashboard(
        { tenantId: "acme/widgets", wakeId: "wake-1" },
        {
          dashboardUrl: "https://dashboard.example.test/",
          wakeApiKey: "derived-key",
          fetcher,
        },
      ),
    ).resolves.toEqual({ ok: true, detail: "runner accepted" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://dashboard.example.test/api/kody/loop-wakes/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer derived-key",
        }),
      }),
    );
  });

  it("rejects an insecure remote pool URL", async () => {
    await expect(
      dispatchLoopWakeToDashboard(
        { tenantId: "acme/widgets", wakeId: "wake-1" },
        {
          dashboardUrl: "http://dashboard.example.test",
          wakeApiKey: "derived-key",
          fetcher: vi.fn(),
        },
      ),
    ).rejects.toThrow("HTTPS");
  });
});
