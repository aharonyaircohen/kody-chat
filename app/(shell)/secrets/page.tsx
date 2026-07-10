"use client";

import { secretsChatPlugin, SECRETS_PANEL_ID } from "@dashboard/lib/chat/plugins/secrets";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={secretsChatPlugin} panelId={SECRETS_PANEL_ID} />;
}
