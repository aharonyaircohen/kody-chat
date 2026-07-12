import { createLazyPanel, type ChatPlugin } from "@kody-ade/kody-chat/platform";

export const LEARNING_PANEL_ID = "learning";
export const learningChatPlugin: ChatPlugin = {
  id: LEARNING_PANEL_ID,
  capabilities: ["panels"],
  panels: [{
    id: LEARNING_PANEL_ID,
    title: "Learning",
    render: createLazyPanel("learning", () =>
      import("./panel").then((module) => ({ default: module.LearningPanelView })),
    ),
  }],
};
