import { describe, expect, it } from "vitest";
import {
  conversationIdForGuidedFlowOpen,
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

  it("consumes a one-time definition launch", () => {
    expect(
      locationAfterGuidedFlowLaunch(
        "/chat",
        "?guidedFlow=onboarding&guidedFlowOnce=1",
      ),
    ).toBe("/chat");
  });
});

describe("GuidedFlow chat conversation selection", () => {
  it("creates a fresh conversation for a new flow start", () => {
    expect(
      conversationIdForGuidedFlowOpen(
        { flowId: "onboarding", message: "started" },
        "existing-session",
        () => "new-session",
      ),
    ).toBe("new-session");
  });

  it("keeps the active conversation when explicitly resuming", () => {
    expect(
      conversationIdForGuidedFlowOpen(
        { instanceId: "instance-1", message: "resumed" },
        "existing-session",
        () => "unexpected-new-session",
      ),
    ).toBe("existing-session");
  });

  it("creates a conversation when resuming without an active session", () => {
    expect(
      conversationIdForGuidedFlowOpen(
        { instanceId: "instance-1", message: "resumed" },
        null,
        () => "new-session",
      ),
    ).toBe("new-session");
  });
});
