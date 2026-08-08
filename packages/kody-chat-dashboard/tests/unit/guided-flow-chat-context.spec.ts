import { describe, expect, it } from "vitest";

import { buildGuidedFlowTurnContext } from "../../app/api/kody/chat/guided-flow-context";
import type { GuidedFlowReader } from "../../src/dashboard/lib/guided-flows/reader";

function reader(
  current: Awaited<ReturnType<GuidedFlowReader["getCurrent"]>>,
): GuidedFlowReader {
  return {
    getCurrent: async () => current,
    getOutline: async () => [],
    getStep: async () => null,
    getData: async () => ({}),
    getHistory: async () => ({ items: [] }),
  };
}

describe("GuidedFlow Chat turn context", () => {
  it("adds only the current pointer and tells Chat to read details", async () => {
    const context = await buildGuidedFlowTurnContext(
      reader({
        binding: {
          conversationId: "conversation-1",
          instanceId: "instance-1",
        },
        instance: {
          instanceId: "instance-1",
          flowId: "exercise",
          flowVersion: 2,
          currentStepId: "question",
          status: "active",
          revision: 4,
          data: { privateLargeValue: "not-injected" },
          output: {},
          backStack: ["intro"],
          stack: [
            {
              flowId: "lesson",
              flowVersion: 1,
              currentStepId: "exercise",
              data: {},
              backStack: ["welcome"],
            },
          ],
        },
        definition: {
          id: "exercise",
          version: 2,
          title: "Exercise",
          steps: [
            {
              id: "question",
              title: "Question",
              explanation: "Choose one.",
              rendererSlug: "selection-list",
              actions: [{ id: "submit", target: { type: "complete" } }],
            },
          ],
        },
        currentStep: {
          id: "question",
          title: "Question",
          explanation: "Choose one.",
          rendererSlug: "selection-list",
          actions: [{ id: "submit", target: { type: "complete" } }],
        },
        path: [
          {
            flowId: "lesson",
            flowVersion: 1,
            currentStepId: "exercise",
            data: {},
            backStack: ["welcome"],
          },
        ],
      }),
    );

    expect(context).toContain("instance-1");
    expect(context).toContain("exercise@2 / question");
    expect(context).toContain("lesson@1 / exercise");
    expect(context).toContain("guided_flow_read");
    expect(context).not.toContain("privateLargeValue");
  });

  it("adds nothing when the conversation has no bound flow", async () => {
    await expect(buildGuidedFlowTurnContext(reader(null))).resolves.toBeNull();
  });
});
