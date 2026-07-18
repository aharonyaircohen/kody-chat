import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

import {
  listManagedGoalRunLogs,
  summarizeManagedGoalRunLog,
} from "../../src/dashboard/lib/managed-goal-run-logs";

describe("managed goal run logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes persisted JSONL loop decisions for the dashboard", () => {
    const summary = summarizeManagedGoalRunLog(
      "2026-07-05T10-00-00Z.jsonl",
      "logs/goals/ci-health/runs/2026-07-05T10-00-00Z.jsonl",
      "https://github.com/test/state/blob/main/log.jsonl",
      [
        "not-json",
        JSON.stringify({
          time: "2026-07-05T10:00:00.000Z",
          trigger: {
            kind: "manual",
            eventName: "workflow_dispatch",
            actor: "aguy",
          },
          run: { githubRunId: "123456789" },
          links: {
            workflowRun: "https://github.com/test/repo/actions/runs/123456789",
          },
        }),
        JSON.stringify({
          time: "2026-07-05T10:01:00.000Z",
          status: "completed",
          event: "decision",
          summary: "CI health loop checked the repo.",
          trace: {
            capability: {
              capability: "ci-health",
              implementation: "goal-manager",
            },
            result: { status: "success" },
          },
          decision: {
            kind: "noop",
            reason: "Nothing to fix.",
          },
          goal: {
            state: "active",
            stage: "monitor",
          },
        }),
      ].join("\n"),
    );

    expect(summary).toMatchObject({
      fileName: "2026-07-05T10-00-00Z.jsonl",
      startedAt: "2026-07-05T10:00:00.000Z",
      updatedAt: "2026-07-05T10:01:00.000Z",
      triggerKind: "manual",
      eventName: "workflow_dispatch",
      actor: "aguy",
      githubRunId: "123456789",
      githubRunUrl: "https://github.com/test/repo/actions/runs/123456789",
      status: "completed",
      event: "decision",
      summary: "CI health loop checked the repo.",
      capability: "ci-health",
      implementation: "goal-manager",
      decisionKind: "noop",
      decisionReason: "Nothing to fix.",
      goalState: "active",
      stage: "monitor",
    });
  });

  it("returns an empty run list when a goal has no persisted events", async () => {
    backend.query.mockResolvedValue([]);

    await expect(
      listManagedGoalRunLogs({
        octokit: {} as never,
        owner: "test-owner",
        repo: "state-repo",
        goalId: "ci-health",
      }),
    ).resolves.toEqual({ goalId: "ci-health", runs: [] });
  });

  it("reads newest run logs first up to the requested limit", async () => {
    backend.query.mockResolvedValue([
      {
        runId: "2026-07-04T10-00-00Z",
        seq: 0,
        event: { time: "2026-07-04T10:00:00.000Z" },
        time: "2026-07-04T10:00:00.000Z",
      },
      {
        runId: "2026-07-05T10-00-00Z",
        seq: 0,
        event: { time: "2026-07-05T10:00:00.000Z" },
        time: "2026-07-05T10:00:00.000Z",
      },
    ]);

    const payload = await listManagedGoalRunLogs({
      octokit: {} as never,
      owner: "test-owner",
      repo: "state-repo",
      goalId: "ci-health",
      limit: 1,
    });

    expect(payload.runs).toHaveLength(1);
    expect(payload.runs[0]?.fileName).toBe("2026-07-05T10-00-00Z");
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "test-owner/state-repo",
      goalId: "ci-health",
      limit: 100,
    });
  });
});
