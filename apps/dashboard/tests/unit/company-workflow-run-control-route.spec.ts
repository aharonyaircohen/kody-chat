import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({ token: "ghp_test", owner: "acme", repo: "widgets" })),
  getUserOctokit: vi.fn(async () => ({})),
}));
const github = vi.hoisted(() => ({ setGitHubContext: vi.fn(), clearGitHubContext: vi.fn() }));
const files = vi.hoisted(() => ({
  readWorkflowRunStateFile: vi.fn(),
  readLatestWorkflowRunStateFile: vi.fn(),
}));
const runner = vi.hoisted(() => ({ stopWorkflowRunner: vi.fn() }));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@dashboard/lib/github-client", () => github);
vi.mock("@dashboard/lib/workflow-run-state-files", () => files);
vi.mock("@dashboard/lib/workflow-runner-control", () => runner);

import { POST } from "../../app/api/kody/company/workflows/[id]/runs/[runId]/route";

describe("workflow run controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stops a fly-backed run", async () => {
    files.readWorkflowRunStateFile.mockResolvedValue({
      workflowId: "pilot",
      runId: "run-abc",
      state: { status: "running", completedStepIds: [], transitionCounts: {}, facts: {}, evidence: {}, artifacts: [] },
      runner: { kind: "fly", machineId: "machine-1" },
    });
    const res = await POST(
      new NextRequest("https://dash.test/api/kody/company/workflows/pilot/runs/run-abc", {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
      }),
      { params: Promise.resolve({ id: "pilot", runId: "run-abc" }) },
    );
    expect(res.status).toBe(200);
    expect(runner.stopWorkflowRunner).toHaveBeenCalledWith(expect.anything(), "machine-1");
  });

  it("rejects stopping a pooled runner because it may be shared", async () => {
    files.readWorkflowRunStateFile.mockResolvedValue({
      workflowId: "pilot", runId: "run-abc", state: { status: "running", completedStepIds: [], transitionCounts: {}, facts: {}, evidence: {}, artifacts: [] },
      runner: { kind: "pool", machineId: "machine-1" },
    });
    const res = await POST(
      new NextRequest("https://dash.test/api/kody/company/workflows/pilot/runs/run-abc", { method: "POST", body: JSON.stringify({ action: "stop" }) }),
      { params: Promise.resolve({ id: "pilot", runId: "run-abc" }) },
    );
    expect(res.status).toBe(409);
    expect(runner.stopWorkflowRunner).not.toHaveBeenCalled();
  });
});
