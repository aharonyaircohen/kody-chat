import { describe, expect, it } from "vitest";
import {
  advanceGuidedFlow,
  cancelGuidedFlow,
  createGuidedFlowInstance,
  goBackGuidedFlow,
  type GuidedFlowDefinition,
} from "../../src/dashboard/lib/guided-flows/controller";

const DEFINITION: GuidedFlowDefinition = {
  id: "example-flow",
  version: 1,
  title: "Example flow",
  steps: [
    {
      id: "start",
      title: "Start",
      explanation: "Choose where to begin.",
      rendererSlug: "selection-list",
      transitions: { continue: "finish" },
    },
    {
      id: "finish",
      title: "Finish",
      explanation: "Review the result.",
      rendererSlug: "approval-card",
      allowedActions: ["approve"],
    },
  ],
};

describe("guided flow controller", () => {
  it("creates an active instance at the definition start step", () => {
    expect(createGuidedFlowInstance(DEFINITION, "instance-1")).toMatchObject({
      instanceId: "instance-1",
      flowId: "example-flow",
      flowVersion: 1,
      currentStepId: "start",
      status: "active",
      revision: 0,
      data: {},
      history: [],
    });
  });

  it("advances through a validated transition and stores non-sensitive data", () => {
    const instance = createGuidedFlowInstance(DEFINITION, "instance-1");

    const next = advanceGuidedFlow(DEFINITION, instance, {
      actionId: "continue",
      result: { choice: "workflow" },
    });

    expect(next).toMatchObject({
      currentStepId: "finish",
      status: "active",
      revision: 1,
      data: { choice: "workflow" },
      history: ["start"],
    });
  });

  it("rejects an unknown transition without changing state", () => {
    const instance = createGuidedFlowInstance(DEFINITION, "instance-1");

    expect(() =>
      advanceGuidedFlow(DEFINITION, instance, { actionId: "unknown" }),
    ).toThrow("Unknown transition");
  });

  it("supports back and increments the revision", () => {
    const instance = advanceGuidedFlow(
      DEFINITION,
      createGuidedFlowInstance(DEFINITION, "instance-1"),
      { actionId: "continue", result: { choice: "workflow" } },
    );

    expect(goBackGuidedFlow(DEFINITION, instance)).toMatchObject({
      currentStepId: "start",
      revision: 2,
      history: [],
      status: "active",
    });
  });

  it("completes when the current step has no next step", () => {
    const instance = createGuidedFlowInstance(DEFINITION, "instance-1");
    const atFinish = advanceGuidedFlow(DEFINITION, instance, {
      actionId: "continue",
    });

    expect(
      advanceGuidedFlow(DEFINITION, atFinish, { actionId: "approve" }),
    ).toMatchObject({ status: "completed", revision: 2 });
  });

  it("cancels an active flow and rejects further changes", () => {
    const instance = createGuidedFlowInstance(DEFINITION, "instance-1");
    const cancelled = cancelGuidedFlow(instance);

    expect(cancelled).toMatchObject({ status: "cancelled", revision: 1 });
    expect(() => goBackGuidedFlow(DEFINITION, cancelled)).toThrow("not active");
  });

  it("rejects undeclared terminal actions and does not retain sensitive fields", () => {
    const instance = advanceGuidedFlow(
      DEFINITION,
      createGuidedFlowInstance(DEFINITION, "instance-1"),
      { actionId: "continue", result: { token: "secret", choice: "workflow" } },
    );

    expect(() =>
      advanceGuidedFlow(DEFINITION, instance, { actionId: "cancel" }),
    ).toThrow("Unknown action");

    const completed = advanceGuidedFlow(DEFINITION, instance, {
      actionId: "approve",
      result: { password: "hidden", note: "kept" },
    });
    expect(completed.data).toMatchObject({ note: "kept" });
    expect(completed.data).not.toHaveProperty("password");
  });
});
