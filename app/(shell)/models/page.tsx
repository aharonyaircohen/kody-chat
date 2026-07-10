"use client";

import { modelsChatPlugin, MODELS_PANEL_ID } from "@dashboard/lib/chat/plugins/models";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={modelsChatPlugin} panelId={MODELS_PANEL_ID} />;
}
