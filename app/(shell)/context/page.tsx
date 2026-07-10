"use client";

import { contextChatPlugin, CONTEXT_PANEL_ID } from "@dashboard/lib/chat/plugins/context";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={contextChatPlugin} panelId={CONTEXT_PANEL_ID} />;
}
