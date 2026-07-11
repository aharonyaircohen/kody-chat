"use client";

import {
  languagesChatPlugin,
  LANGUAGES_PANEL_ID,
} from "@dashboard/lib/chat/plugins/languages";
import { PluginPanel } from "@dashboard/lib/components/PluginPanel";

export default function Page() {
  return (
    <PluginPanel plugin={languagesChatPlugin} panelId={LANGUAGES_PANEL_ID} />
  );
}
