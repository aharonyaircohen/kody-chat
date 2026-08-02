import { describe, expect, it } from "vitest";
import {
  guidedFlowChatReducer,
  initialGuidedFlowChatState,
  isGuidedFlowOpenRequest,
} from "../../src/dashboard/lib/guided-flows/chat-controller";

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

  it("keeps one explicit request until its owner acknowledges it", () => {
    const requested = guidedFlowChatReducer(initialGuidedFlowChatState, {
      type: "request",
      requestId: "request-1",
      request: {
        instanceId: "instance-1",
        message: "resumed",
      },
    });

    expect(
      requested.pending && "instanceId" in requested.pending.request
        ? requested.pending.request.instanceId
        : null,
    ).toBe("instance-1");
    expect(
      guidedFlowChatReducer(requested, {
        type: "acknowledge",
        requestId: "not-the-owner",
      }),
    ).toBe(requested);
    expect(
      guidedFlowChatReducer(requested, {
        type: "acknowledge",
        requestId: requested.pending?.id ?? "",
      }),
    ).toEqual(initialGuidedFlowChatState);
  });

  it("marks a request that must wait for the full Chat route", () => {
    expect(
      guidedFlowChatReducer(initialGuidedFlowChatState, {
        type: "request",
        requestId: "request-1",
        destination: "chat",
        request: {
          flowId: "initialize-kody-engine",
          message: "started",
        },
      }).pending,
    ).toMatchObject({
      destination: "chat",
      request: { flowId: "initialize-kody-engine" },
    });
  });
});
