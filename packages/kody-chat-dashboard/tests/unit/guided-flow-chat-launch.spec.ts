import { describe, expect, it } from "vitest";
import {
  guidedFlowChatHref,
  locationAfterGuidedFlowLaunch,
} from "../../src/dashboard/lib/guided-flows/chat-launch";

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

  it("builds a repository-scoped chat link for a flow definition", () => {
    expect(
      guidedFlowChatHref(
        { owner: "A-Guy-educ", repo: "A-Guy-Teacher" },
        "whole number/addition",
      ),
    ).toBe(
      "/repo/A-Guy-educ/A-Guy-Teacher/chat?guidedFlow=whole%20number%2Faddition",
    );
  });
});
