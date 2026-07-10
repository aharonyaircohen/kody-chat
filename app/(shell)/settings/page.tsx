"use client";

import { settingsChatPlugin, SETTINGS_PANEL_ID } from "@dashboard/lib/chat/plugins/settings";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={settingsChatPlugin} panelId={SETTINGS_PANEL_ID} />;
}
