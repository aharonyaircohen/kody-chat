import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "../../scripts/verify-public-mcp-helpers.mjs";

describe("public MCP live verification helpers", () => {
  it("limits concurrent requests while preserving every result", async () => {
    let active = 0;
    let peak = 0;
    const task = vi.fn(async (value: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });

    const result = await mapWithConcurrency(
      Array.from({ length: 13 }, (_, index) => index),
      4,
      task,
    );

    expect(result).toEqual(Array.from({ length: 13 }, (_, index) => index * 2));
    expect(task).toHaveBeenCalledTimes(13);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
