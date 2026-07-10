"use client";

import { commandsPageChatPlugin, COMMANDS_PAGE_PANEL_ID } from "@dashboard/lib/chat/plugins/commands-page";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={commandsPageChatPlugin} panelId={COMMANDS_PAGE_PANEL_ID} />;
}
