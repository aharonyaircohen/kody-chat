import { describe, expect, it } from "vitest";

import { normalizeWorkflowRunState } from "@dashboard/lib/workflow-run-state";

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
