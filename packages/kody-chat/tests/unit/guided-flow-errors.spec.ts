import { describe, expect, it } from "vitest";
import { guidedFlowActionErrorMessage } from "@dashboard/lib/guided-flows/errors";

describe("guided flow action errors", () => {
  it("turns validation failures into an actionable message", () => {
    expect(guidedFlowActionErrorMessage("invalid_guided_flow_input")).toBe(
      "Please complete the current step before continuing.",
    );
  });

  it("never exposes internal error codes", () => {
    const message = guidedFlowActionErrorMessage("guided_flow_action_failed");
    expect(message).toBe(
      "We couldn't continue this Guided Flow. Your progress is saved; please try again.",
    );
    expect(message).not.toContain("guided_flow_action_failed");
  });
});
