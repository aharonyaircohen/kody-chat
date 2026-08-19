import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveServerContext = vi.fn();
const spawnRunner = vi.fn();

vi.mock("../../src/runners/server-run", () => ({
  resolveServerContext: (...args: unknown[]) => resolveServerContext(...args),
}));

vi.mock("../../src/plugin/runners/fly", () => ({
  spawnRunner: (...args: unknown[]) => spawnRunner(...args),
}));

import { runScheduledKodyOnRunner } from "../../src/runners/kody-runner";

describe("runScheduledKodyOnRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveServerContext.mockResolvedValue({
      ok: true,
      context: {
        owner: "acme",
        repo: "widgets",
        githubToken: "github-token",
        allSecrets: { MODEL_KEY: "secret" },
        flyToken: "fly-token",
        perfTier: "low",
        octokit: {
          rest: {
            repos: {
              get: vi.fn(async () => ({ data: { default_branch: "trunk" } })),
            },
          },
        },
      },
    });
    spawnRunner.mockResolvedValue({ machineId: "machine-1" });
  });

  it("starts a fresh machine directly with the resolved repo context", async () => {
    const runRequest = {
      requestId: "wake-1",
      target: { type: "workflow" as const, id: "scheduled-fanout" },
      intent: "tick",
      source: "schedule" as const,
    };
    const result = await runScheduledKodyOnRunner(
      new NextRequest("https://dashboard.test"),
      { taskId: "wake-1", runRequest, dashboardUrl: "https://dashboard.test" },
    );

    expect(result).toEqual({
      ok: true,
      runner: "fly",
      machineId: "machine-1",
      ref: "trunk",
    });
    expect(spawnRunner).toHaveBeenCalledWith({
      repo: "acme/widgets",
      githubToken: "github-token",
      runRequest,
      dashboardUrl: "https://dashboard.test",
      ref: "trunk",
      allSecrets: { MODEL_KEY: "secret" },
      flyToken: "fly-token",
      perfTier: "low",
    });
  });
});
