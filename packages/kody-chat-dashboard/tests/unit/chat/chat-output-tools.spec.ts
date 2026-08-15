import { describe, expect, it } from "vitest";
import {
  FINAL_ANSWER_TOOL,
  SHOW_VIEW_TOOL,
  getToolErrorMessage,
  getViewRecoveryContent,
  getToollessRecoveryContent,
  isToolErrorOutput,
  selectChatOutputActiveTools,
  selectChatOutputToolChoice,
} from "../../../src/dashboard/lib/chat-output-tools";

describe("chat output tools", () => {
  it("keeps ordinary model text when a provider cannot call final_answer", () => {
    expect(getToollessRecoveryContent("Hi there!")).toBe("Hi there!");
    expect(getToollessRecoveryContent("  ")).toContain(
      "I couldn't complete a reliable answer",
    );
  });

  it("classifies structured tool error outputs", () => {
    expect(isToolErrorOutput({ error: "show_view requires data" })).toBe(true);
    expect(getToolErrorMessage({ error: "show_view requires data" })).toBe(
      "show_view requires data",
    );
    expect(isToolErrorOutput({ error: "" })).toBe(false);
    expect(isToolErrorOutput({ content: "ok" })).toBe(false);
  });

  it("falls back to plain text after a broken rendered card", () => {
    expect(getViewRecoveryContent("")).toBe(
      "I couldn't display that UI card. Would you like me to retry?",
    );
    expect(getViewRecoveryContent("I found the agent.")).toBe(
      "I found the agent.\n\nWould you like me to retry?",
    );
  });

  it("keeps renderer tools available for ordinary answer turns", () => {
    expect(
      selectChatOutputActiveTools({
        toolNames: [
          FINAL_ANSWER_TOOL,
          SHOW_VIEW_TOOL,
          "fetch_url",
          "list_reports",
        ],
        requireViewOutput: false,
        allowPreRenderTools: false,
      }),
    ).toEqual([FINAL_ANSWER_TOOL, SHOW_VIEW_TOOL, "fetch_url", "list_reports"]);
  });

  it("pins show_view by name when a step is locked to it (regression: MiniMax ignores generic required and ends with prose)", () => {
    expect(selectChatOutputToolChoice([SHOW_VIEW_TOOL])).toEqual({
      type: "tool",
      toolName: SHOW_VIEW_TOOL,
    });
  });

  it("keeps generic required tool choice when multiple tools are active", () => {
    expect(
      selectChatOutputToolChoice([SHOW_VIEW_TOOL, "list_reports"]),
    ).toEqual("required");
    expect(
      selectChatOutputToolChoice([FINAL_ANSWER_TOOL, SHOW_VIEW_TOOL]),
    ).toEqual("required");
  });

  it("uses automatic selection for providers without strict tool-choice support", () => {
    const capabilities = {
      supportsRequiredToolChoice: false,
      supportsNamedToolChoice: false,
    };

    expect(
      selectChatOutputToolChoice(
        [FINAL_ANSWER_TOOL, SHOW_VIEW_TOOL],
        capabilities,
      ),
    ).toBe("auto");
    expect(selectChatOutputToolChoice([SHOW_VIEW_TOOL], capabilities)).toBe(
      "auto",
    );
  });

  it("allows read tools before renderer output for explicit selection turns", () => {
    expect(
      selectChatOutputActiveTools({
        toolNames: [FINAL_ANSWER_TOOL, SHOW_VIEW_TOOL, "list_reports"],
        requireViewOutput: true,
        allowPreRenderTools: true,
      }),
    ).toEqual([SHOW_VIEW_TOOL, "list_reports"]);
  });
});
