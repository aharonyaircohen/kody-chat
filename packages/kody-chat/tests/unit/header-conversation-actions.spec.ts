import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/chat/surface/HeaderControls.tsx"),
  "utf8",
);
const COMPOSER_SOURCE = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/chat/surface/Composer.tsx"),
  "utf8",
);
describe("chat conversation actions", () => {
  it("keeps model and effort controls beside the chat title", () => {
    expect(SOURCE).toContain('aria-label="Model"');
    expect(SOURCE).toContain('aria-label="Effort"');
    expect(SOURCE).toContain("Add chat model");
    expect(SOURCE).not.toContain("chatSettingsControl");
    expect(COMPOSER_SOURCE).not.toContain("chatSettingsControl");
  });

  it("places the message count beside the chat title", () => {
    const headerRow = SOURCE.slice(
      SOURCE.indexOf("return ("),
      SOURCE.indexOf("Context bar:"),
    );
    const titleRow = SOURCE.slice(
      SOURCE.indexOf('data-testid="chat-context-bar"'),
    );

    expect(titleRow).toContain("{messageCountBadge}");
    expect(headerRow).not.toContain("messageCount > 0");
  });

  it("places new conversation and conversations in the header", () => {
    const conversationActions = SOURCE.slice(
      SOURCE.indexOf("const conversationActions"),
      SOURCE.indexOf("return ("),
    );
    const titleRow = SOURCE.slice(
      SOURCE.indexOf('data-testid="chat-context-bar"'),
    );
    const headerActions = SOURCE.slice(
      SOURCE.indexOf("Right: Window and host actions"),
      SOURCE.indexOf("Title line:"),
    );

    expect(conversationActions).toContain('aria-label="New conversation"');
    expect(conversationActions).toContain('aria-label="Toggle conversations"');
    expect(headerActions).toContain("{conversationActions}");
    expect(titleRow).not.toContain("{conversationActions}");
  });
});
