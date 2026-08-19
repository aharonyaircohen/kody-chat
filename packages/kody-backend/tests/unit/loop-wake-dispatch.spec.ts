import { describe, expect, it, vi } from "vitest";

import {
  buildLoopWakePoolJob,
  dispatchLoopWakeToPool,
} from "../../src/loop-wake-dispatch";

describe("Loop wake pool dispatch", () => {
  it("builds the canonical scheduled fan-out request without credentials", () => {
    const job = buildLoopWakePoolJob({
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
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      dispatchLoopWakeToPool(
        { tenantId: "acme/widgets", wakeId: "wake-1" },
        {
          poolUrl: "https://pool.example.test/",
          poolApiKey: "derived-key",
          fetcher,
        },
      ),
    ).resolves.toEqual({ ok: true, detail: "runner accepted" });

    expect(fetcher).toHaveBeenCalledWith(
      "https://pool.example.test/pool/claim",
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
      dispatchLoopWakeToPool(
        { tenantId: "acme/widgets", wakeId: "wake-1" },
        {
          poolUrl: "http://pool.example.test",
          poolApiKey: "derived-key",
          fetcher: vi.fn(),
        },
      ),
    ).rejects.toThrow("HTTPS");
  });
});
