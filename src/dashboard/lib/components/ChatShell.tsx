/**
 * @fileType component
 * @domain kody-chat
 * @pattern chat-shell
 * @ai-summary Shared operator shell for the kody-chat product: the
 *   dashboard's real Sidebar (user menu, theme toggle, collapse, version
 *   badge, search) + routed page content + a persistent KodyChat rail.
 *   On mobile the sidebar is replaced by a top bar whose hamburger opens
 *   the dashboard's MobileMenu with the same sections. kody-chat mounts it
 *   with its built-in pages; hosts like the dashboard EXTEND it by passing
 *   their own nav sections and chat plugins — they never fork the shell.
 */
"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, Zap } from "lucide-react";
import type { ChatPlugin } from "../chat/platform/types";
import { KodyChat } from "@dashboard/lib/components/KodyChat";
// Package-owned (the dashboard deletes its copies) — must stay relative.
import { Sidebar } from "./Sidebar";
import { MobileMenu } from "./MobileMenu";
import type {
  SettingsNavItem,
  SettingsNavSection,
} from "@dashboard/lib/components/settings-nav";
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Repo-scoped paths (/repo/<owner>/<name>/...) rewrite to the bare route;
  // strip the prefix so the chat-home check matches both shapes.
  const bare = pathname.replace(/^\/repo\/[^/]+\/[^/]+/, "") || "/";
  const isChatHome = bare === "/";

  // Mobile menu gets the pinned chat-home entry as a regular row.
  const mobileSections: readonly SettingsNavSection[] = pinnedItem
    ? [{ title: title, items: [pinnedItem] }, ...sections]
    : sections;

  return (
    <div
      data-testid="chat-shell"
      className="flex h-dvh min-h-dvh flex-col bg-background text-foreground"
    >
      {/* Mobile top bar — the desktop Sidebar is hidden below md, so the
          hamburger opens the shared MobileMenu with the same sections. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 md:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white"
            aria-hidden="true"
          >
            <Zap className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold">{title}</span>
        </span>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>
      <MobileMenu
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        sections={mobileSections}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          sections={sections}
          pinnedItem={pinnedItem}
          brandLabel={title}
        />

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
    </div>
  );
}
