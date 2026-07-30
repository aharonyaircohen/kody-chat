import { describe, expect, it } from "vitest";

import type { GuidedFlowDefinition } from "../../src/dashboard/lib/guided-flows/controller";
import {
  runGuidedFlowAction,
  startGuidedFlowRuntime,
} from "../../src/dashboard/lib/guided-flows/runtime";
import { GuidedFlowCompositionError } from "../../src/dashboard/lib/guided-flows/errors";

const CHILD: GuidedFlowDefinition = {
  id: "child",
  version: 1,
  title: "Child",
  steps: [
    {
      id: "answer",
      title: "Answer",
      explanation: "Choose.",
      rendererSlug: "selection-list",
      allowedActions: ["submit"],
    },
  ],
};

const PARENT: GuidedFlowDefinition = {
  id: "parent",
  version: 1,
  title: "Parent",
  steps: [
    {
      id: "child",
      type: "flow",
      title: "Run child",
      explanation: "Complete child.",
      flowId: CHILD.id,
      flowVersion: CHILD.version,
      transitions: { complete: "summary" },
    },
    {
      id: "summary",
      title: "Summary",
      explanation: "Done.",
      rendererSlug: "approval-card",
    },
  ],
};

const resolveDefinition = (flowId: string, flowVersion: number) =>
  [PARENT, CHILD].find(
    (definition) =>
      definition.id === flowId && definition.version === flowVersion,
  ) ?? null;

describe("guided flow runtime", () => {
  it("starts through nested steps using the same runtime used by transports", () => {
    const started = startGuidedFlowRuntime({
      definition: PARENT,
      instanceId: "instance-1",
      resolveDefinition,
    });

    expect(started.definition).toBe(CHILD);
    expect(started.instance).toMatchObject({
      flowId: "child",
      currentStepId: "answer",
      stack: [{ flowId: "parent", currentStepId: "child" }],
    });
  });

  it("submits a child, returns compact output, and resumes its parent", () => {
    const started = startGuidedFlowRuntime({
      definition: PARENT,
      instanceId: "instance-1",
      resolveDefinition,
    });

    const result = runGuidedFlowAction({
      definition: started.definition,
      instance: started.instance,
      action: "submit",
      actionId: "submit",
      result: { answer: "four", token: "hidden" },
      resolveDefinition,
    });

    expect(result.definition).toBe(PARENT);
    expect(result.completed).toHaveLength(1);
    expect(result.instance).toMatchObject({
      flowId: "parent",
      currentStepId: "summary",
      revision: 1,
      data: {
        flowResults: {
          child: {
            flowId: "child",
            flowVersion: 1,
            status: "completed",
            output: { answer: "four" },
          },
        },
      },
    });
  });

  it("returns a stable code when a referenced flow is unavailable", () => {
    try {
      startGuidedFlowRuntime({
        definition: PARENT,
        instanceId: "instance-1",
        resolveDefinition: () => null,
      });
      throw new Error("Expected the missing child flow to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GuidedFlowCompositionError);
      expect((error as GuidedFlowCompositionError).code).toBe(
        "nested_flow_unavailable",
      );
    }
  });
});
