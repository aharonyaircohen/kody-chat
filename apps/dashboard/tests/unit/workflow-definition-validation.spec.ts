import { describe, expect, it } from "vitest";

import {
  type WorkflowDefinition,
  type WorkflowStepDefinition,
  normalizeWorkflowDefinition,
  validateWorkflowDefinition,
} from "../../src/dashboard/lib/workflow-definitions";

function workflow(
  steps: WorkflowStepDefinition[],
  startAt = "inspect",
): WorkflowDefinition {
  return {
    name: "Agent workflow",
    agent: "kody",
    capabilities: ["inspect", "repair", "publish"],
    startAt,
    steps,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("validateWorkflowDefinition", () => {
  it("keeps one capability input value", () => {
    expect(
      normalizeWorkflowDefinition({
        name: "Release",
        agent: "kody",
        capabilities: ["inspect"],
        steps: [
          {
            id: "inspect",
            capability: "inspect",
            input: { prefer: "ours" },
          },
        ],
      })?.steps?.[0]?.input,
    ).toEqual({ prefer: "ours" });
  });

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

  it("preserves and accepts an explicit workflow end", () => {
    const normalized = normalizeWorkflowDefinition({
      name: "Review loop",
      agent: "kody",
      capabilities: ["review", "fix"],
      startAt: "review",
      steps: [
        {
          id: "review",
          capability: "review",
          next: [
            {
              to: "$end",
              when: { "result.verdict": "pass" },
            },
            { to: "fix", default: true },
          ],
        },
        {
          id: "fix",
          capability: "fix",
          next: [{ to: "review", default: true, maxIterations: 3 }],
        },
      ],
    });

    expect(normalized?.steps?.[0]?.next?.[0]).toEqual({
      to: "$end",
      when: { "result.verdict": "pass" },
    });
    expect(normalized && validateWorkflowDefinition(normalized)).toEqual([]);
  });

  it.each([
    [
      workflow([
        { id: "inspect", capability: "inspect", next: [{ to: "missing" }] },
      ]),
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
    [
      workflow([{ id: "inspect", capability: "not-declared" }]),
      "undeclared_capability",
    ],
  ] as const)("rejects invalid workflow %#", (value, code) => {
    expect(
      validateWorkflowDefinition(value).map((issue) => issue.code),
    ).toContain(code);
  });

  it("rejects a capability that is not installed in the agency", () => {
    expect(
      validateWorkflowDefinition(
        workflow([{ id: "inspect", capability: "inspect" }]),
        {
          knownCapabilities: new Set(["publish"]),
        },
      ).map((issue) => issue.code),
    ).toContain("unknown_capability");
  });
});
