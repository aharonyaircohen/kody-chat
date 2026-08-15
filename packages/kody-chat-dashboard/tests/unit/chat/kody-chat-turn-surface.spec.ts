import { describe, expect, it } from "vitest";
import {
  completeActiveAssistant,
  removeActiveAssistant,
  replaceActiveAssistantWithError,
  updateActiveAssistant,
} from "../../../src/dashboard/lib/components/kody-chat-turn-surface";

const messages = [
  { role: "assistant" as const, content: "old", isLoading: false },
  { role: "assistant" as const, content: "current", isLoading: true },
];

describe("chat turn surface", () => {
  it("updates only the newest active assistant bubble", () => {
    expect(
      updateActiveAssistant(messages, (message) => ({
        ...message,
        content: "updated",
      })),
    ).toEqual([messages[0], { ...messages[1], content: "updated" }]);
  });

  it("completes or removes the current bubble without changing history", () => {
    expect(completeActiveAssistant(messages)).toEqual([
      messages[0],
      { ...messages[1], isLoading: false },
    ]);
    expect(removeActiveAssistant(messages)).toEqual([messages[0]]);
  });

  it("replaces active bubbles with one canonical error", () => {
    expect(replaceActiveAssistantWithError(messages, "Error: failed")).toEqual([
      messages[0],
      {
        role: "assistant",
        content: "Error: failed",
        isLoading: false,
        isError: true,
      },
    ]);
  });
});
