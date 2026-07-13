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
const SETTINGS_SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/lib/chat/surface/ChatSettingsMenu.tsx",
  ),
  "utf8",
);

describe("chat conversation actions", () => {
  it("keeps long model descriptions inside the settings menu", () => {
    expect(SETTINGS_SOURCE).toContain("max-w-[calc(100vw-2rem)]");
    expect(SETTINGS_SOURCE).toContain("w-full min-w-0");
    expect(SETTINGS_SOURCE).toContain("min-w-0 flex-1");
  });

  it("opens the header settings menu into the viewport", () => {
    expect(SETTINGS_SOURCE).toContain('placement = "above"');
    expect(SETTINGS_SOURCE).toContain("right-0");
    expect(SETTINGS_SOURCE).toContain('"top-full mt-2"');
  });

  it("keeps model controls by the composer instead of in the header", () => {
    expect(SOURCE).toContain('<div className="hidden">');
    expect(SOURCE).toContain("chatSettingsControl");
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

  it("places new conversation and conversations beside the chat title", () => {
    const conversationActions = SOURCE.slice(
      SOURCE.indexOf("const conversationActions"),
      SOURCE.indexOf("return ("),
    );
    const titleRow = SOURCE.slice(
      SOURCE.indexOf('data-testid="chat-context-bar"'),
    );
    const headerActions = SOURCE.slice(
      SOURCE.indexOf("Right: Window and host actions"),
      SOURCE.indexOf("Context bar:"),
    );

    expect(conversationActions).toContain('aria-label="New conversation"');
    expect(conversationActions).toContain('aria-label="Toggle conversations"');
    expect(titleRow).toContain("{conversationActions}");
    expect(headerActions).not.toContain('aria-label="New conversation"');
    expect(headerActions).not.toContain('aria-label="Toggle conversations"');
  });
});
