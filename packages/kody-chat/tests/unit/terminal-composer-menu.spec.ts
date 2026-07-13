import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  TerminalBottomControls,
  TerminalModeToggle,
} from "../../src/dashboard/lib/chat/plugins/terminal/TerminalControls";

const CONTROLS_SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/lib/chat/plugins/terminal/TerminalControls.tsx",
  ),
  "utf8",
);
const HOST_SOURCE = readFileSync(
  resolve(
    __dirname,
    "../../src/dashboard/lib/components/kody-chat-terminal-host.tsx",
  ),
  "utf8",
);

describe("terminal controls in the composer menu", () => {
  it("keeps terminal actions in the same full-width menu-row layout", () => {
    expect(HOST_SOURCE).toContain('layout="menu"');
    expect(CONTROLS_SOURCE).toContain('layout?: "row" | "menu"');

    const markup = renderToStaticMarkup(
      createElement(TerminalBottomControls, {
        onAddToChat: () => undefined,
        onRestart: () => undefined,
        onClear: () => undefined,
        actionBusy: false,
        layout: "menu",
      }),
    );

    expect(markup).toContain("Add to AI chat");
    expect(markup).toContain("Restart terminal");
    expect(markup).toContain("Clear terminal");
    expect(markup.match(/w-full/g)).toHaveLength(3);
  });

  it("keeps the mode-toggle container unchanged when the selected mode changes", () => {
    const renderToggle = (chatMode: "ai" | "terminal") =>
      renderToStaticMarkup(
        createElement(TerminalModeToggle, {
          chatMode,
          terminalStatusLabel: "idle",
          hasLiveTerminal: false,
          connectionState: "idle",
          onSelectAiMode: () => undefined,
          onOpenTerminal: () => undefined,
        }),
      );

    const outerClass = (markup: string) =>
      markup.match(/^<div class="([^"]+)"/)?.[1];

    expect(outerClass(renderToggle("ai"))).toBe(
      outerClass(renderToggle("terminal")),
    );
  });
});
