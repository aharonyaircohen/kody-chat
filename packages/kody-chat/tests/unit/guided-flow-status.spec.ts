import { describe, expect, it } from "vitest";
import { buildGuidedFlowStatusView } from "@kody-ade/kody-chat/guided-flows/registry";

describe("guided flow status renderer", () => {
  it("renders status and safe navigation actions from data", () => {
    const view = buildGuidedFlowStatusView({
      instanceId: "flow-1",
      sessionId: "session-1",
      title: "Create a workflow",
      stepIndex: 0,
      stepCount: 2,
    });

    expect(view.rendererSlug).toBe("guided-flow-status");
    expect(view.resultTarget).toBe("chat");
    expect(view.ui).toEqual({
      type: "stack",
      children: [
        { type: "text", value: "Hi! I can help you with:", variant: "title" },
        { type: "text", value: "You have an unfinished GuidedFlow." },
        { type: "text", value: "Create a workflow · Step 1 of 2" },
        {
          type: "row",
          children: [
            {
              type: "button",
              label: "Resume flow",
              action: {
                id: "resume",
                label: "Resume flow",
                response: "resume",
                variant: "primary",
              },
            },
          ],
        },
      ],
    });
    expect(view.id).toBe("guided-flow-status-flow-1-session-1");
  });
});
