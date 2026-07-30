import { describe, expect, it } from "vitest";
import { locationAfterGuidedFlowLaunch } from "../../src/dashboard/lib/guided-flows/chat-launch";

describe("GuidedFlow chat launch location", () => {
  it("keeps a definition launch so a new conversation starts the flow again", () => {
    expect(
      locationAfterGuidedFlowLaunch(
        "/repo/acme/widgets/chat",
        "?guidedFlow=lesson&instanceKey=student-1",
      ),
    ).toBe(
      "/repo/acme/widgets/chat?guidedFlow=lesson&instanceKey=student-1",
    );
  });

  it("consumes an exact instance launch without removing unrelated params", () => {
    expect(
      locationAfterGuidedFlowLaunch(
        "/repo/acme/widgets/chat",
        "?guidedFlowInstanceId=instance-1&panel=chat",
      ),
    ).toBe("/repo/acme/widgets/chat?panel=chat");
  });
});
