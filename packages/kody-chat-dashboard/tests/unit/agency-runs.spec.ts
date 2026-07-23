import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

function storedRuns(runs: Array<Record<string, unknown>>) {
  return runs.map((run) => ({
    runId: String(run.id),
    subjectType: run.subjectType,
    subjectId: run.subjectId,
    run,
    updatedAt: String(run.updatedAt ?? ""),
  }));
}

function storedEvents(events: Array<Record<string, unknown>>) {
  return events.map((event, seq) => ({
    runId: "run",
    seq,
    event,
    time: String(event.time ?? ""),
  }));
}

import {
  listAgencyRuns,
  readAgencyRunDetail,
} from "../../src/dashboard/lib/agency-runs";

describe("agency runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects the engine run index without scanning goals or logs", async () => {
    backend.query.mockResolvedValue(
      storedRuns([
        {
          version: 1,
          id: "workflow:release-queue:run-workflow-1",
          subjectType: "workflow",
          subjectId: "release-queue",
          subjectLabel: "Release queue",
          status: "running",
          title: "Release queue",
          summary: "Planning workflow",
          currentStep: "plan",
          startedAt: "2026-07-05T10:00:00.000Z",
          updatedAt: "2026-07-05T10:02:00.000Z",
          kodyRunId: "run-workflow-1",
          model: "claude/claude-haiku-4-5-20251001",
          modelProvider: "claude",
          modelName: "claude-haiku-4-5-20251001",
          implementation: "release-prepare",
          workflow: "release-queue",
          triggerMode: "manual",
        },
        {
          version: 1,
          id: "loop:ci-health:gh-123-1",
          subjectType: "loop",
          subjectId: "ci-health",
          subjectModel: "agentLoop",
          status: "running",
          title: "ci-health",
          currentStep: "loop.tick.dispatch",
          startedAt: "2026-07-05T10:00:00.000Z",
          updatedAt: "2026-07-05T10:01:00.000Z",
          kodyRunId: "gh-123-1",
          githubRunId: "123",
          githubRunUrl: "https://github.com/test/repo/actions/runs/123",
          detailUrl: "https://github.com/test/state/ci-health.jsonl",
          sourcePath: "logs/goals/ci-health/runs/run.jsonl",
          model: "claude/claude-haiku-4-5-20251001",
          triggerMode: "scheduled",
        },
        {
          version: 1,
          id: "capability:ignored:run-1",
          subjectType: "capability",
          subjectId: "ignored",
          status: "running",
          title: "Ignored",
          updatedAt: "2026-07-05T10:03:00.000Z",
        },
      ]),
    );

    const payload = await listAgencyRuns({
      octokit: {} as never,
      owner: "test-owner",
      repo: "test-repo",
    });

    expect(backend.query).toHaveBeenCalledOnce();
    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "test-owner/test-repo",
      limit: 50,
    });
    expect(payload.counts).toEqual({
      goal: 0,
      loop: 1,
      workflow: 1,
      capability: 1,
    });
    expect(payload.source).toEqual({
      path: "convex:agencyRuns",
      updatedAt: "2026-07-05T10:03:00.000Z",
      etag: null,
    });
    expect(payload.runs.map((run) => `${run.kind}:${run.targetId}`)).toEqual([
      "capability:ignored",
      "workflow:release-queue",
      "loop:ci-health",
    ]);
    expect(payload.runs[1]).toMatchObject({
      model: "claude/claude-haiku-4-5-20251001",
      implementation: "release-prepare",
      origin: "manual",
    });
  });

  it("reads one selected run detail file", async () => {
    backend.query.mockResolvedValue(
      storedEvents([
        {
          time: "2026-07-05T10:00:00.000Z",
          event: "loop.tick.dispatch",
          status: "dispatch",
        },
        {
          time: "2026-07-05T10:01:00.000Z",
          event: "loop.tick.done",
          status: "completed",
        },
      ]),
    );

    const payload = await readAgencyRunDetail({
      octokit: {} as never,
      owner: "test-owner",
      repo: "test-repo",
      sourcePath: "logs/goals/ci-health/runs/run.jsonl",
    });

    expect(payload.events).toHaveLength(2);
    expect(payload.events[1]).toMatchObject({
      event: "loop.tick.done",
      status: "completed",
    });
    expect(payload.workflowLog).toBeNull();
  });

  it("summarizes the selected GitHub run log when requested", async () => {
    backend.query.mockResolvedValue(
      storedEvents([
        {
          time: "2026-07-05T10:00:00.000Z",
          event: "goal.tick.dispatch",
          status: "dispatch",
        },
      ]),
    );
    const octokit = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: { jobs: [{ id: 42, name: "run" }] },
        })
        .mockResolvedValueOnce({
          data: [
            "DONE",
            "PR_SUMMARY:",
            "- Dev CI is red; issue #745 already tracks this.",
            "- No duplicate dispatch issued.",
            "",
            "=== SESSION ok ===",
          ].join("\n"),
        }),
    };

    const payload = await readAgencyRunDetail({
      octokit: octokit as never,
      owner: "test-owner",
      repo: "test-repo",
      sourcePath: "logs/goals/ci-health/runs/run.jsonl",
      githubRunId: "123",
    });

    expect(octokit.request).toHaveBeenCalledWith(
      "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
      expect.objectContaining({ run_id: 123 }),
    );
    expect(payload.workflowLog).toMatchObject({
      jobId: "42",
      jobName: "run",
      status: "completed",
      summary:
        "Dev CI is red; issue #745 already tracks this. No duplicate dispatch issued.",
    });
  });

  it("caches selected GitHub run log summaries across repeated detail reads", async () => {
    backend.query.mockResolvedValue(
      storedEvents([
        {
          time: "2026-07-05T10:00:00.000Z",
          event: "goal.tick.dispatch",
          status: "dispatch",
        },
      ]),
    );
    const octokit = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: { jobs: [{ id: 99, name: "run" }] },
        })
        .mockResolvedValueOnce({
          data: ["DONE", "PR_SUMMARY:", "- Cached summary."].join("\n"),
        }),
    };

    const first = await readAgencyRunDetail({
      octokit: octokit as never,
      owner: "cache-owner",
      repo: "cache-repo",
      sourcePath: "logs/goals/cache-check/runs/run.jsonl",
      githubRunId: "789",
    });
    const second = await readAgencyRunDetail({
      octokit: octokit as never,
      owner: "cache-owner",
      repo: "cache-repo",
      sourcePath: "logs/goals/cache-check/runs/run.jsonl",
      githubRunId: "789",
    });

    expect(second).toEqual(first);
    expect(octokit.request).toHaveBeenCalledTimes(2);
    expect(backend.query).toHaveBeenCalledTimes(1);
  });

  it("formats noisy agency health summaries into readable lines", async () => {
    backend.query.mockResolvedValue([]);
    const noisyLine = [
      "Added A-Guy-Web/reports/ai-agency-health-matrix/runs/2026-07-05T23-37-00Z.md in A-Guy-educ/backend-store.",
      "AI Agency Health: YELLOW (80 rows).",
      'KODY_AGENCY_BOUNDARY_EVAL={"version":1,"status":"pass","findings":[{"rule":"observe-does-not-act"},{"rule":"verify-does-not-fix"},{"rule":"capability-does-not-own-goal-progress"}]}',
      "→ kody: in-process hand-off → dev-ci-health (hop 1/60)",
    ].join(" ");
    const octokit = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          data: { jobs: [{ id: 43, name: "run" }] },
        })
        .mockResolvedValueOnce({
          data: noisyLine,
        }),
    };

    const payload = await readAgencyRunDetail({
      octokit: octokit as never,
      owner: "test-owner",
      repo: "test-repo",
      sourcePath: "logs/goals/ai-agency-health/runs/run.jsonl",
      githubRunId: "456",
    });

    expect(payload.workflowLog?.lines).toEqual([
      "Added report: A-Guy-Web/reports/ai-agency-health-matrix/runs/2026-07-05T23-37-00Z.md (A-Guy-educ/backend-store).",
      "AI Agency Health: YELLOW (80 rows).",
      "Agency boundary eval: pass (3 checks).",
      "Hand-off: kody -> dev-ci-health (hop 1/60).",
    ]);
    expect(payload.workflowLog?.evidenceLines).toEqual(
      expect.arrayContaining([
        "Report file: A-Guy-Web/reports/ai-agency-health-matrix/runs/2026-07-05T23-37-00Z.md.",
        "Backend: A-Guy-educ/backend-store.",
        "Health matrix: YELLOW (80 rows).",
        "Boundary eval: version 1, status pass.",
        'Raw boundary eval: KODY_AGENCY_BOUNDARY_EVAL={"version":1,"status":"pass","findings":[{"rule":"observe-does-not-act"},{"rule":"verify-does-not-fix"},{"rule":"capability-does-not-own-goal-progress"}]}',
      ]),
    );
    expect(payload.workflowLog?.evidenceLines.join("\n")).toContain(
      "Raw workflow line: Added A-Guy-Web/reports/ai-agency-health-matrix",
    );
    expect(payload.workflowLog?.summary).not.toContain(
      "KODY_AGENCY_BOUNDARY_EVAL",
    );
  });

  it("uses the selected Convex run id directly", async () => {
    backend.query.mockResolvedValue([]);

    await readAgencyRunDetail({
      octokit: {} as never,
      owner: "test-owner",
      repo: "test-repo",
      sourcePath: "goal:ci-health:run-1",
    });

    expect(backend.query).toHaveBeenCalledWith(expect.anything(), {
      tenantId: "test-owner/test-repo",
      runId: "goal:ci-health:run-1",
    });
  });
});
