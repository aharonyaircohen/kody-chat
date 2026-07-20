/**
 * @fileType component
 * @domain chat-plugin-capabilities
 * @pattern plugin-panel-view
 * @ai-summary Capabilities panel view (phase 2 step 4). Renders the SAME tree
 *   the route renders — the plugin WRAPS the page's inner component, it
 *   does not fork it. The `display: contents` wrapper is only a stable
 *   marker proving the flipped shell rendered the plugin's view; it adds
 *   no layout, so the rendered page is byte-identical to the route's.
 */
"use client";

import { AuthGuard } from "../../../auth-guard";
import { CapabilitiesManager } from "@dashboard/features/admin/components/CapabilitiesManager";
import type { ChatPanelViewProps } from "@kody-ade/kody-chat/platform";

export const CAPABILITIES_PANEL_TESTID = "chat-panel-capabilities";

export function CapabilitiesPanelView(_props: ChatPanelViewProps) {
  return (
    <div className="contents" data-testid={CAPABILITIES_PANEL_TESTID}>
      <AuthGuard>
        <CapabilitiesManager basePath="/capabilities" />
      </AuthGuard>
    </div>
  );
}
