import { describe, expect, it, vi } from "vitest";

import {
  startWorkflow,
  type WorkflowExecutionDependencies,
} from "@dashboard/features/workflows/server/start-workflow";

const workflow = {
  name: "Learn from Runs",
  agent: "memory-steward",
  capabilities: ["extract-run-learning"],
  createdAt: "2026-07-27T12:00:00.000Z",
  updatedAt: "2026-07-27T12:00:00.000Z",
};

function dependencies(
  overrides: Partial<WorkflowExecutionDependencies> = {},
): WorkflowExecutionDependencies {
  return {
    createRequestId: () => "run-memory-1",
    loadWorkflow: vi.fn(async () => ({ workflow })),
    validateWorkflow: vi.fn(() => []),
    authorize: vi.fn(async () => true),
    dispatch: vi.fn(async (request) => ({
      requestId: request.requestId,
      acceptedAt: "2026-07-27T12:00:00.000Z",
    })),
    ...overrides,
  };
}

describe("startWorkflow", () => {
  it("dispatches a provider-neutral correlated Engine request", async () => {
    const deps = dependencies();

    const result = await startWorkflow(
      {
        workflowId: "learn-from-runs",
        source: "dashboard",
      },
      deps,
    );

    expect(deps.dispatch).toHaveBeenCalledWith({
      requestId: "run-memory-1",
      target: { type: "workflow", id: "learn-from-runs" },
      intent: "run",
      source: "dashboard",
    });
    expect(result).toEqual({
      kind: "accepted",
      workflowId: "learn-from-runs",
      requestId: "run-memory-1",
      acceptedAt: "2026-07-27T12:00:00.000Z",
    });
  });

  it("uses the existing run id when resuming", async () => {
    const deps = dependencies();

    await startWorkflow(
      {
        workflowId: "learn-from-runs",
        source: "dashboard",
        requestId: "run-existing",
      },
      deps,
    );

    expect(deps.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "run-existing" }),
    );
  });

  it("does not dispatch missing or invalid workflows", async () => {
    const missing = dependencies({
      loadWorkflow: vi.fn(async () => null),
    });
    const invalid = dependencies({
      validateWorkflow: vi.fn(() => [
        {
          code: "bad_graph",
          message: "Workflow graph is invalid",
          path: "steps",
        },
      ]),
    });

    await expect(
      startWorkflow(
        { workflowId: "missing", source: "dashboard" },
        missing,
      ),
    ).resolves.toEqual({ kind: "not-found" });
    await expect(
      startWorkflow(
        { workflowId: "broken", source: "dashboard" },
        invalid,
      ),
    ).resolves.toEqual({
      kind: "invalid",
      issues: [
        {
          code: "bad_graph",
          message: "Workflow graph is invalid",
          path: "steps",
        },
      ],
    });
    expect(missing.dispatch).not.toHaveBeenCalled();
    expect(invalid.dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch when explicit approval is required", async () => {
    const deps = dependencies({
      authorize: vi.fn(async () => false),
    });

    await expect(
      startWorkflow(
        {
          workflowId: "learn-from-runs",
          source: "dashboard",
          approved: false,
        },
        deps,
      ),
    ).resolves.toEqual({ kind: "approval-required" });
    expect(deps.dispatch).not.toHaveBeenCalled();
  });
});
