import { describe, expect, it } from "vitest";

import { normalizeWorkflowRunState } from "@dashboard/lib/workflow-run-state";

describe("normalizeWorkflowRunState", () => {
  it("preserves the exact input and output recorded for each step", () => {
    const state = normalizeWorkflowRunState({
      status: "done",
      completedStepIds: ["inspect", "repair"],
      steps: {
        inspect: {
          capability: "inspect",
          status: "done",
          input: { request: "repair it" },
          output: { findings: "exact failure text" },
          startedAt: "2026-08-09T10:00:00.000Z",
          completedAt: "2026-08-09T10:01:00.000Z",
        },
      },
    });

    expect(state?.steps.inspect).toEqual({
      capability: "inspect",
      status: "done",
      input: { request: "repair it" },
      output: { findings: "exact failure text" },
      startedAt: "2026-08-09T10:00:00.000Z",
      completedAt: "2026-08-09T10:01:00.000Z",
    });
  });
});

describe("workflow run state", () => {
  it("keeps durable progress and drops invalid values", () => {
    expect(
      normalizeWorkflowRunState({
        status: "running",
        currentStepId: "verify",
        completedStepIds: ["inspect", 3],
        transitionCounts: { "repair->inspect": 2, bad: -1 },
        facts: { releaseReady: true },
        evidence: { testsPassed: true, bad: "yes" },
        artifacts: [{ label: "PR", url: "https://example.test/pr/1" }, null],
      }),
    ).toMatchObject({
      status: "running",
      currentStepId: "verify",
      completedStepIds: ["inspect"],
      transitionCounts: { "repair->inspect": 2 },
      facts: { releaseReady: true },
      evidence: { testsPassed: true },
      artifacts: [{ label: "PR", url: "https://example.test/pr/1" }],
    });
  });
});
