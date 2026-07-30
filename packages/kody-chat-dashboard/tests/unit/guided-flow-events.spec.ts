import { describe, expect, it } from "vitest";
import { isGuidedFlowOpenRequest } from "../../src/dashboard/lib/guided-flows/events";

describe("GuidedFlow open requests", () => {
  it("accepts a definition start request", () => {
    expect(
      isGuidedFlowOpenRequest({
        flowId: "lesson",
        instanceKey: "student-1",
        message: "started",
      }),
    ).toBe(true);
  });

  it("accepts an exact instance resume request", () => {
    expect(
      isGuidedFlowOpenRequest({
        instanceId: "instance-1",
        message: "resumed",
      }),
    ).toBe(true);
  });

  it("rejects incomplete requests", () => {
    expect(isGuidedFlowOpenRequest({ message: "started" })).toBe(false);
  });
});
