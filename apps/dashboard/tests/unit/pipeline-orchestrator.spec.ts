import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutation: vi.fn(),
  loadWorkflow: vi.fn(),
  startWorkflow: vi.fn(),
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({ mutation: h.mutation }),
}));
vi.mock("@dashboard/features/workflows/server/company-workflow-loader", () => ({
  createCompanyWorkflowLoader: vi.fn(() => h.loadWorkflow),
}));
vi.mock(
  "@dashboard/features/workflows/server/github-actions-engine-gateway",
  () => ({ createGitHubActionsEngineGateway: vi.fn(() => vi.fn()) }),
);
vi.mock("@dashboard/features/workflows/server/start-workflow", () => ({
  startWorkflow: h.startWorkflow,
}));
vi.mock("@dashboard/lib/workflow-definitions", () => ({
  validateWorkflowDefinition: vi.fn(() => []),
  validateWorkflowInput: vi.fn(() => []),
  workflowInputFromFacts: vi.fn((facts) => facts),
}));
vi.mock("@kody-ade/base/logger", () => ({
  logger: { error: vi.fn() },
}));

import {
  advancePipelineForWorkflowCompletion,
  startPipelineExecution,
} from "../../src/dashboard/features/pipelines/server/pipeline-orchestrator";

describe("Pipeline waiting runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.loadWorkflow.mockResolvedValue({
      workflow: { inputSchema: {}, steps: [] },
    });
    h.startWorkflow.mockResolvedValue({
      kind: "accepted",
      workflowId: "ci-repair",
      requestId: "waiting-workflow",
      acceptedAt: "2026-08-13T00:00:00.000Z",
    });
  });

  it("dispatches a waiting Pipeline immediately after completion", async () => {
    h.mutation
      .mockResolvedValueOnce({
        kind: "start",
        pipelineId: "ci-repair",
        runId: "waiting-run",
        stepIndex: 0,
        step: {
          id: "repair",
          workflowId: "ci-repair",
          status: "pending",
        },
        facts: { branch: "main", ciRunId: 2 },
      })
      .mockResolvedValueOnce(true);

    await expect(
      advancePipelineForWorkflowCompletion({
        octokit: {} as never,
        owner: "acme",
        repo: "shop",
        workflowRunId: "active-workflow",
        status: "success",
        output: {},
      }),
    ).resolves.toBe(true);

    expect(h.startWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "ci-repair",
        input: { branch: "main", ciRunId: 2 },
      }),
      expect.any(Object),
    );
    expect(h.mutation).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        pipelineId: "ci-repair",
        runId: "waiting-run",
        stepIndex: 0,
      }),
    );
  });

  it("dispatches the waiting Pipeline when the active dispatch fails", async () => {
    h.mutation
      .mockResolvedValueOnce({
        claimed: true,
        run: { updatedAt: "2026-08-13T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        kind: "start",
        pipelineId: "ci-repair",
        runId: "waiting-run",
        stepIndex: 0,
        step: {
          id: "repair",
          workflowId: "ci-repair",
          status: "pending",
        },
        facts: { branch: "main", ciRunId: 2 },
      })
      .mockResolvedValueOnce(true);
    h.startWorkflow
      .mockRejectedValueOnce(new Error("dispatch failed"))
      .mockResolvedValueOnce({
        kind: "accepted",
        workflowId: "ci-repair",
        requestId: "waiting-workflow",
        acceptedAt: "2026-08-13T00:00:00.000Z",
      });

    await expect(
      startPipelineExecution({
        octokit: {} as never,
        owner: "acme",
        repo: "shop",
        pipelineId: "ci-repair",
        pipelineRunId: "active-run",
        concurrencyKey: "main",
        pipeline: {
          name: "CI Repair",
          steps: [{ id: "repair", workflow: "ci-repair" }],
          createdAt: "2026-08-13T00:00:00.000Z",
          updatedAt: "2026-08-13T00:00:00.000Z",
        },
        facts: { branch: "main", ciRunId: 1 },
      }),
    ).rejects.toThrow("dispatch failed");

    expect(h.startWorkflow).toHaveBeenCalledTimes(2);
    expect(h.startWorkflow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workflowId: "ci-repair",
        input: { branch: "main", ciRunId: 2 },
      }),
      expect.any(Object),
    );
  });
});
