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
  it("keeps model and effort controls separate from the agency selector", () => {
    expect(SOURCE).toContain('aria-label="Agency agent"');
    expect(SOURCE).toContain('aria-label="Model"');
    expect(SOURCE).toContain('aria-label="Effort"');
    expect(SOURCE).toContain("const agencyAgentEntries");
    expect(SOURCE).not.toContain(">Agent:</span>");
    expect(SOURCE).not.toContain("agencyAgentControl");
    expect(SOURCE.match(/\{agencyAgentPicker\}/g)).toHaveLength(1);
    expect(SOURCE).toContain("{agentList.map((entry) => {");
    expect(SOURCE).not.toContain("const modelEntries");
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
      SOURCE.indexOf("return (", SOURCE.indexOf("const conversationActions")),
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
    expect(SOURCE.indexOf("{agencyAgentPicker}")).toBeGreaterThan(
      SOURCE.indexOf("Title line:"),
    );
  });

  it("closes each header dropdown on an outside pointer press", () => {
    expect(SOURCE).toContain(
      'document.addEventListener("pointerdown", closeMenusOutsideTarget)',
    );
    expect(SOURCE).toContain("agencyAgentMenuRef.current?.contains");
    expect(SOURCE).toContain("modelMenuRef.current?.contains");
    expect(SOURCE).toContain("reasoningMenuRef.current?.contains");
  });
});
