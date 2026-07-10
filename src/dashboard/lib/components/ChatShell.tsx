/**
 * @fileType component
 * @domain kody-chat
 * @pattern chat-shell
 * @ai-summary THE shared shell layout for chat-first products: Sidebar (with
 *   repo switcher slot) | persistent chat rail (drag-resizable, fullscreen on
 *   the chat home) | routed page content. kody-chat mounts it with built-in
 *   pages and the default chat; the dashboard wraps it, passing its own chat
 *   pane, sections, and content. Hosts EXTEND this shell — they never fork
 *   the layout.
 */
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, Zap } from "lucide-react";
import type { ChatPlugin } from "../chat/platform/types";
import { KodyChat } from "@dashboard/lib/components/KodyChat";
// Package-owned (the dashboard deletes its copies) — must stay relative.
import { Sidebar } from "./Sidebar";
import { MobileMenu } from "./MobileMenu";
import { RepoSwitcher } from "./RepoSwitcher";
import type {
  SettingsNavItem,
  SettingsNavSection,
} from "@dashboard/lib/components/settings-nav";
import { cn } from "@dashboard/lib/utils";

const RAIL_MIN = 360;
const RAIL_MAX = 960;
const RAIL_DEFAULT = 440;
const RAIL_WIDTH_KEY = "kody:rail-width";

export interface ChatShellProps {
  /** Product label shown next to the sidebar logo. */
  title?: string;
  /**
   * Sidebar nav sections. Omit for the dashboard's own mode-based nav
   * (Sidebar propless behavior); pass a list to own the nav.
   */
  sections?: readonly SettingsNavSection[];
  /**
   * Pinned item above the sections. Omit for the Sidebar default
   * (Dashboard); pass null to pin nothing.
   */
  pinnedItem?: SettingsNavItem | null;
  /**
   * Slot below the sidebar brand header. Defaults to the repo switcher —
   * every host gets repo management in the sidepanel; pass null to remove.
   */
  sidebarHeaderExtra?: ReactNode;
  /** Plugins registered on the DEFAULT chat mount (ignored when `chat` set). */
  chatPlugins?: Array<{ plugin: ChatPlugin }>;
  /** Custom chat pane. Hosts with their own KodyChat wiring pass it here. */
  chat?: ReactNode;
  /**
   * Whether the current route is the full-chat view (chat takes the whole
   * pane, page content hidden). Defaults to pathname === "/".
   */
  isChatHome?: boolean;
  /** Shell-owned mobile top bar + menu. Hosts with their own header pass false. */
  showMobileHeader?: boolean;
  /** data-testid stamped on the page-content pane (host test hooks). */
  contentTestId?: string;
  /** Routed page content. */
  children?: ReactNode;
}

export function ChatShell({
  title = "Kody Chat",
  sections,
  pinnedItem,
  sidebarHeaderExtra = <RepoSwitcher variant="rail" />,
  chatPlugins,
  chat,
  isChatHome: isChatHomeProp,
  showMobileHeader = true,
  contentTestId,
  children,
}: ChatShellProps) {
  const pathname = usePathname() ?? "/";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Repo-scoped paths (/repo/<owner>/<name>/...) rewrite to the bare route;
  // strip the prefix so the chat-home check matches both shapes.
  const bare = pathname.replace(/^\/repo\/[^/]+\/[^/]+/, "") || "/";
  const isChatHome = isChatHomeProp ?? bare === "/";

  // Drag-to-resize width (px) for the chat rail, persisted per device.
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const saved = Number(localStorage.getItem(RAIL_WIDTH_KEY));
    if (saved >= RAIL_MIN && saved <= RAIL_MAX) setRailWidth(saved);
  }, []);
  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const railEl = (e.currentTarget as HTMLElement)
      .previousElementSibling as HTMLElement | null;
    const railLeft = railEl ? railEl.getBoundingClientRect().left : 0;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        RAIL_MAX,
        Math.max(RAIL_MIN, Math.round(ev.clientX - railLeft)),
      );
      setRailWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setRailWidth((w) => {
        localStorage.setItem(RAIL_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  // Mobile menu gets the pinned chat-home entry as a regular row.
  const mobileSections: readonly SettingsNavSection[] | undefined = sections
    ? pinnedItem
      ? [{ title, items: [pinnedItem] }, ...sections]
      : sections
    : undefined;

  const chatPane = chat ?? (
    <KodyChat
      presentation="standalone"
      compactHeader
      hideTerminalMode
      railFullscreen={isChatHome}
      plugins={chatPlugins}
    />
  );

  return (
    <div
      data-testid="chat-shell"
      className="h-screen flex flex-col overflow-hidden bg-background text-foreground"
    >
      {showMobileHeader && (
        <>
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
        </>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Nav sidebar — far left. Chat sits to its right, so the order
            reads nav | chat | page. */}
        <Sidebar
          {...(sections !== undefined ? { sections } : {})}
          {...(pinnedItem !== undefined ? { pinnedItem } : {})}
          brandLabel={title}
          headerExtra={sidebarHeaderExtra}
        />

        {/* Chat rail — right of the nav sidebar. A fixed-width side rail by
            default; full-width on the chat home. Always mounted so chat
            history/streaming survive navigation. */}
        <div
          className={cn(
            "flex-col min-h-0 min-w-0 bg-black/20",
            isChatHome
              ? "flex flex-1"
              : "hidden md:flex shrink-0 border-r border-border",
            !dragging && "transition-[width] duration-200",
          )}
          style={!isChatHome ? { width: railWidth } : undefined}
          aria-label="Kody chat"
        >
          {chatPane}
        </div>

        {/* Drag handle between the chat rail and the page — desktop,
            side-rail routes only (not on the full chat view). */}
        {!isChatHome && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat"
            onPointerDown={startResize}
            onDoubleClick={() => {
              setRailWidth(RAIL_DEFAULT);
              localStorage.setItem(RAIL_WIDTH_KEY, String(RAIL_DEFAULT));
            }}
            className={cn(
              "hidden md:block shrink-0 w-1.5 cursor-col-resize select-none -ml-px",
              "hover:bg-emerald-500/40 active:bg-emerald-500/60",
              dragging ? "bg-emerald-500/60" : "bg-transparent",
            )}
            title="Drag to resize · double-click to reset"
          />
        )}

        {/* Page content — hidden on the chat home (chat takes the pane). */}
        <div
          className={cn(
            "min-w-0 h-full overflow-hidden flex flex-col",
            isChatHome && "hidden",
            "flex-1",
          )}
          {...(contentTestId ? { "data-testid": contentTestId } : {})}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
