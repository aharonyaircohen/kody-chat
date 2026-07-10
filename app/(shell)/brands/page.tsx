"use client";

import { brandsChatPlugin, BRANDS_PANEL_ID } from "@dashboard/lib/chat/plugins/brands";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return <PluginPanel plugin={brandsChatPlugin} panelId={BRANDS_PANEL_ID} />;
}
