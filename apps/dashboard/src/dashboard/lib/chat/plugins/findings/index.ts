import { createLazyPanel, type ChatPlugin } from "@kody-ade/kody-chat/platform";

export const FINDINGS_PANEL_ID = "findings";
export const findingsChatPlugin: ChatPlugin = {
  id: FINDINGS_PANEL_ID,
  capabilities: ["panels"],
  panels: [{
    id: FINDINGS_PANEL_ID,
    title: "Findings",
    render: createLazyPanel("findings", () =>
      import("./panel").then((module) => ({ default: module.FindingsPanelView })),
    ),
  }],
};
