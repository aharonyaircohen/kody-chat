/**
 * @fileType component
 * @domain layout
 * @pattern sidebar-chrome
 * @ai-summary The dashboard's sidepanel-header extension: repo switcher +
 *   notifications bell, passed into the shared ChatShell's
 *   sidebarHeaderExtra slot. Rendered inside NotificationsProvider (the
 *   shell sits under the providers in ChatRailShell).
 */
"use client";

import { RepoSwitcher } from "@kody-ade/kody-chat/components/RepoSwitcher";
import { NotificationCenter } from "../notifications/NotificationCenter";
import { useNotifications } from "../notifications/NotificationsProvider";

export function SidebarChrome() {
  const { store, permission, isSupported, requestPermission } =
    useNotifications();

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <RepoSwitcher variant="rail" />
      </div>
      <NotificationCenter
        anchor="rail"
        store={store}
        browserPermission={permission}
        isSupported={isSupported}
        onRequestPermission={requestPermission}
      />
    </div>
  );
}
