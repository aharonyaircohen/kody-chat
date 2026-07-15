import { describe, expect, it } from "vitest";

import {
  buildManagedGoalState,
  normalizeManagedGoalState,
} from "@dashboard/lib/managed-goals";
import {
  buildWorkflowDefinition,
  mergeWorkflowDefinition,
  normalizeWorkflowDefinition,
} from "@dashboard/lib/workflow-definitions";

describe("model run without approval flag", () => {
  it("stores the flag on managed goals only when enabled", () => {
    expect(
      buildManagedGoalState({
        type: "improve",
        outcome: "Ship it",
        runWithoutApproval: true,
      }).runWithoutApproval,
    ).toBe(true);

    expect(
      buildManagedGoalState({
        type: "improve",
        outcome: "Ship it",
        runWithoutApproval: false,
      }).runWithoutApproval,
    ).toBeUndefined();
  });

  it("normalizes legacy managed goals as approval-required by default", () => {
    expect(
      normalizeManagedGoalState({
        version: 1,
        state: "active",
        type: "improve",
        destination: { outcome: "Ship it", evidence: ["done"] },
        capabilities: ["fix"],
        route: [{ stage: "fix", evidence: "done", capability: "fix" }],
        facts: {},
        blockers: [],
      })?.runWithoutApproval,
    ).toBeUndefined();
  });

  it("stores and preserves the flag on workflows", () => {
    const workflow = buildWorkflowDefinition({
      name: "QA",
      capabilities: ["qa-goal"],
      runWithoutApproval: true,
    });

    expect(workflow.runWithoutApproval).toBe(true);
    expect(
      mergeWorkflowDefinition(workflow, { name: "QA updated" })
        .runWithoutApproval,
    ).toBe(true);
    expect(
      normalizeWorkflowDefinition({
        version: 1,
        name: "Legacy",
        capabilities: ["qa-goal"],
      })?.runWithoutApproval,
    ).toBeUndefined();
  });

  it("normalizes Store workflow steps as capabilities", () => {
    const workflow = normalizeWorkflowDefinition({
      version: 1,
      name: "Task Delivery",
      startAt: "inspect",
      steps: [
        {
          id: "inspect",
          capability: "task-verifier",
          next: [
            {
              to: "repair",
              when: { "facts.needsFix": true },
            },
            { to: "done", default: true },
          ],
        },
        {
          id: "repair",
          capability: "assigned-task-runner",
          inputs: { feedback: { from: "facts.feedback" } },
          next: [{ to: "inspect", maxIterations: 2 }],
        },
        { id: "done", capability: "task-verifier" },
      ],
    });

    expect(workflow?.capabilities).toEqual([
      "task-verifier",
      "assigned-task-runner",
    ]);
    expect(workflow?.startAt).toBe("inspect");
    expect(workflow?.steps?.[0]?.next?.[0]).toEqual({
      to: "repair",
      when: { "facts.needsFix": true },
    });
    expect(workflow?.steps?.[1]?.inputs).toEqual({
      feedback: { from: "facts.feedback" },
    });
  });
});
