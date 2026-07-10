"use client";

import { memoryChatPlugin, MEMORY_PANEL_ID } from "@dashboard/lib/chat/plugins/memory";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={memoryChatPlugin} panelId={MEMORY_PANEL_ID} />;
}
