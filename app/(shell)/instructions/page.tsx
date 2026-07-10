"use client";

import { instructionsChatPlugin, INSTRUCTIONS_PANEL_ID } from "@dashboard/lib/chat/plugins/instructions";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={instructionsChatPlugin} panelId={INSTRUCTIONS_PANEL_ID} />;
}
