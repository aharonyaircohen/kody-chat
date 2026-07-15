import { describe, expect, it } from "vitest";

import {
  type WorkflowDefinition,
  type WorkflowStepDefinition,
  validateWorkflowDefinition,
} from "../../src/dashboard/lib/workflow-definitions";

function workflow(
  steps: WorkflowStepDefinition[],
  startAt = "inspect",
): WorkflowDefinition {
  return {
    version: 1 as const,
    name: "Agent workflow",
    capabilities: ["inspect", "repair", "publish"],
    startAt,
    steps,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("validateWorkflowDefinition", () => {
  it("accepts a complete branch and bounded loop", () => {
    expect(
      validateWorkflowDefinition(
        workflow([
          {
            id: "inspect",
            capability: "inspect",
            next: [
              { to: "repair", when: { "facts.needsFix": true } },
              { to: "publish", default: true },
            ],
          },
          {
            id: "repair",
            capability: "repair",
            next: [{ to: "inspect", maxIterations: 3 }],
          },
          { id: "publish", capability: "publish" },
        ]),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      workflow([{ id: "inspect", capability: "inspect", next: [{ to: "missing" }] }]),
      "missing_transition_target",
    ],
    [
      workflow([
        { id: "inspect", capability: "inspect", next: [{ to: "repair" }] },
        { id: "repair", capability: "repair", next: [{ to: "inspect" }] },
      ]),
      "unbounded_loop",
    ],
    [
      workflow([
        {
          id: "inspect",
          capability: "inspect",
          next: [{ to: "repair", when: { "facts.needsFix": true } }],
        },
        { id: "repair", capability: "repair" },
      ]),
      "missing_default_transition",
    ],
    [
      workflow([
        { id: "inspect", capability: "inspect", next: [{ to: "publish" }] },
        { id: "repair", capability: "repair" },
        { id: "publish", capability: "publish" },
      ]),
      "unreachable_step",
    ],
    [workflow([{ id: "inspect", capability: "not-declared" }]), "undeclared_capability"],
  ] as const)("rejects invalid workflow %#", (value, code) => {
    expect(validateWorkflowDefinition(value).map((issue) => issue.code)).toContain(code);
  });

  it("rejects a capability that is not installed in the agency", () => {
    expect(
      validateWorkflowDefinition(workflow([{ id: "inspect", capability: "inspect" }]), {
        knownCapabilities: new Set(["publish"]),
      }).map((issue) => issue.code),
    ).toContain("unknown_capability");
  });
});
