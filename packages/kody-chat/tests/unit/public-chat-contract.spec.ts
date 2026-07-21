import { describe, expect, it } from "vitest";
import { applyChatEvent, type ChatMessage } from "../../library/src/core";

const assistantMessage: ChatMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "",
};

describe("public chat event contract", () => {
  it("streams text into the active assistant message", () => {
    const messages = applyChatEvent([assistantMessage], "assistant-1", {
      type: "text-delta",
      text: "Hello",
    });

    expect(messages[0]?.content).toBe("Hello");
  });

  it("replaces streamed text when the transport supplies a final answer", () => {
    const messages = applyChatEvent(
      [{ ...assistantMessage, content: "draft" }],
      "assistant-1",
      { type: "text-replace", text: "final" },
    );

    expect(messages[0]?.content).toBe("final");
  });

  it("turns a transport failure into visible assistant text", () => {
    const messages = applyChatEvent([assistantMessage], "assistant-1", {
      type: "error",
      message: "Connection failed",
    });

    expect(messages[0]).toMatchObject({
      content: "Connection failed",
      status: "error",
    });
  });

  it("ignores newer transport events that this package version does not understand", () => {
    const messages = applyChatEvent([assistantMessage], "assistant-1", {
      type: "future-event",
      payload: { value: true },
    });

    expect(messages).toEqual([assistantMessage]);
  });
});
