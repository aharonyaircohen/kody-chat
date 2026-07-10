/**
 * @fileType component
 * @domain kody-chat
 * @pattern chat-shell
 * @ai-summary Shared operator shell for the kody-chat product: the
 *   dashboard's real Sidebar (user menu, theme toggle, collapse, version
 *   badge, search) + routed page content + a persistent KodyChat rail.
 *   kody-chat mounts it with its built-in pages; hosts like the dashboard
 *   EXTEND it by passing their own nav sections and chat plugins — they
 *   never fork the shell.
 */
"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { ChatPlugin } from "../chat/platform/types";
import { KodyChat } from "@dashboard/lib/components/KodyChat";
// Package-owned (the dashboard deletes its copy) — must stay relative.
import { Sidebar } from "./Sidebar";
import type { SettingsNavItem, SettingsNavSection } from "@dashboard/lib/components/settings-nav";
import { cn } from "@dashboard/lib/utils";

export interface ChatShellProps {
  /** Product label shown next to the sidebar logo. */
  title?: string;
  /** Sidebar nav sections. Hosts extend the shell by adding sections. */
  sections: readonly SettingsNavSection[];
  /** Pinned item above the sections (defaults to the chat home). */
  pinnedItem?: SettingsNavItem | null;
  /** Plugins registered on the persistent chat mount. */
  chatPlugins?: Array<{ plugin: ChatPlugin }>;
  /** Routed page content. On the chat home route pass nothing. */
  children?: ReactNode;
}

export function ChatShell({
  title = "Kody Chat",
  sections,
  pinnedItem = null,
  chatPlugins,
  children,
}: ChatShellProps) {
  const pathname = usePathname() ?? "/";
  // Repo-scoped paths (/repo/<owner>/<name>/...) rewrite to the bare route;
  // strip the prefix so the chat-home check matches both shapes.
  const bare = pathname.replace(/^\/repo\/[^/]+\/[^/]+/, "") || "/";
  const isChatHome = bare === "/";

  return (
    <div
      data-testid="chat-shell"
      className="flex h-dvh min-h-dvh bg-background text-foreground"
    >
      <Sidebar sections={sections} pinnedItem={pinnedItem} brandLabel={title} />

      {/* Chat rail — LEFT of the page content, right of the nav, matching
          the dashboard's order (nav | chat | page). Always mounted so chat
          history and streaming survive navigation. */}
      <aside
        aria-label="Kody chat"
        className={cn(
          "min-h-0 flex-col bg-black/20",
          isChatHome
            ? "flex min-w-0 flex-1"
            : "hidden w-[440px] shrink-0 border-r border-border md:flex",
        )}
      >
        <KodyChat
          presentation="standalone"
          compactHeader
          hideTerminalMode
          railFullscreen={isChatHome}
          plugins={chatPlugins}
        />
      </aside>

      {!isChatHome && (
        <main className="min-w-0 h-full flex-1 overflow-y-auto">
          {children}
        </main>
      )}
    </div>
  );
}
