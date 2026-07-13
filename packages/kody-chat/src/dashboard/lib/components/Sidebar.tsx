/**
 * @fileType component
 * @domain kody
 * @pattern app-sidebar
 * @ai-summary Persistent left navigation rail for the Kody dashboard.
 *   Desktop only (hidden below md). Collapsible (64px ↔ 220px) with
 *   localStorage persistence. Top-level entries come from the shared
 *   workspace and settings nav lists, so desktop, mobile, and command palette
 *   destinations stay discoverable. The desktop rail can regroup a few
 *   repo-workspace pages without moving the underlying routes.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bug,
  Github,
  LogOut,
  Moon,
  Search,
  Sparkles,
  Sun,
  Wrench,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@kody-ade/base/ui/avatar";
import { useTheme } from "@dashboard/providers/Theme";
import { cn } from "@kody-ade/base/utils/ui";
import {
  shouldEnableSidebarInboxBadgeData,
  shouldEnableSidebarMessagesBadgeData,
  shouldEnableSidebarReportsBadgeData,
} from "@dashboard/lib/github-background-polling";
import { useAuth } from "@dashboard/lib/auth-context";
import { useGitHubIdentity } from "@dashboard/lib/hooks/useGitHubIdentity";
import { repoScopedHref } from "@kody-ade/base/routes";
import { SimpleTooltip } from "@dashboard/lib/components/SimpleTooltip";
import { InboxBadge } from "@dashboard/lib/components/InboxBadge";
import { MessagesBadge } from "@dashboard/lib/components/MessagesBadge";
import { ReportsBadge } from "@dashboard/lib/components/ReportsBadge";
import {
  DASHBOARD_NAV_ITEM,
  ENGINEER_MODE_SECTIONS,
  VIBE_MODE_SECTIONS,
  activeCollapsibleNavSectionTitle,
  isNavItemActive,
  type SettingsNavItem,
  type SettingsNavSection,
} from "@dashboard/lib/components/settings-nav";

/** Pull just the `text-…` color token out of an item's `tint` (which is a
 *  combined "text-X bg-Y" chip class) so the rail can color the bare icon. */
function iconTintClass(item: { tint?: string }): string | undefined {
  return item.tint?.split(" ").find((c) => c.startsWith("text-"));
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;

type NavItem = SettingsNavItem;
type SidebarMode = "vibe" | "engineer";

const COLLAPSED_KEY = "kody.sidebar.collapsed";
const MODE_KEY = "kody.sidebar.mode";

function isSidebarMode(value: string | null): value is SidebarMode {
  return value === "vibe" || value === "engineer";
}

function defaultModeForPathname(pathname: string): SidebarMode {
  if (pathname === "/vibe" || pathname.startsWith("/vibe/")) return "vibe";
  return "engineer";
}

export interface SidebarProps {
  /**
   * Nav sections. When provided, the host owns the list (the Vibe/Engineer
   * mode toggle is hidden and search covers the given sections). Without it
   * the dashboard's mode-based sections render — byte-identical behavior.
   */
  sections?: readonly SettingsNavSection[];
  /** Pinned item above the section list. Defaults to the Dashboard item. */
  pinnedItem?: SettingsNavItem | null;
  /** Product label next to the logo. */
  brandLabel?: string;
  /**
   * Optional slot rendered just below the brand header (e.g. a repo
   * switcher). Hidden while the rail is collapsed.
   */
  headerExtra?: React.ReactNode;
  /**
   * Optional slot at the right side of the brand row itself (e.g. a
   * notifications bell). Hidden while the rail is collapsed.
   */
  brandRowExtra?: React.ReactNode;
  /** Optional footer action, shown beside the app version. */
  onReportIssue?: () => void;
}

export function Sidebar(props: SidebarProps = {}) {
  return (
    <Suspense fallback={null}>
      <SidebarContent {...props} />
    </Suspense>
  );
}

function SidebarContent({
  sections: hostSections,
  pinnedItem = DASHBOARD_NAV_ITEM,
  brandLabel = "Kody",
  headerExtra,
  brandRowExtra,
  onReportIssue,
}: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const enableInboxBadgeData = shouldEnableSidebarInboxBadgeData(pathname);
  const enableMessagesBadgeData =
    shouldEnableSidebarMessagesBadgeData(pathname);
  const enableReportsBadgeData = shouldEnableSidebarReportsBadgeData(pathname);
  const { auth } = useAuth();
  const { githubUser, connectedRepo, clearGitHubUser } = useGitHubIdentity();
  const { theme, setTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() =>
    defaultModeForPathname(pathname),
  );
  const baseSections =
    hostSections ??
    (sidebarMode === "vibe" ? VIBE_MODE_SECTIONS : ENGINEER_MODE_SECTIONS);
  const activeCollapsibleSectionTitle = useMemo(
    () => activeCollapsibleNavSectionTitle(baseSections, pathname, search),
    [baseSections, pathname, search],
  );
  const [expandedSectionTitle, setExpandedSectionTitle] = useState<
    string | null
  >(() => activeCollapsibleNavSectionTitle(baseSections, pathname, search));

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
      const storedMode = window.localStorage.getItem(MODE_KEY);
      if (isSidebarMode(storedMode)) {
        setSidebarMode(storedMode);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to defaults
    }
    setHydrated(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore — UI still updates
      }
      return next;
    });
  };

  const selectSidebarMode = (next: SidebarMode) => {
    if (next === sidebarMode) return;
    setSidebarMode(next);
    setQuery("");
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore — UI still updates
    }
    router.push(scopedHref(next === "vibe" ? "/vibe" : "/tasks"));
  };

  const scopedHref = (href: string) =>
    auth ? repoScopedHref(auth, href) : href;

  useEffect(() => {
    setQuery("");
  }, [sidebarMode]);

  useEffect(() => {
    setExpandedSectionTitle(activeCollapsibleSectionTitle);
  }, [activeCollapsibleSectionTitle]);

  // Inline filter — narrows the rail's own sections by label/description as
  // the user types. Empty sections drop out so a query collapses the list to
  // just its matches.
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseSections;
    return baseSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${item.label} ${item.description ?? ""}`.toLowerCase().includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [baseSections, query]);

  // Host-provided sections replace the dashboard's mode system entirely.
  const modeToggleVisible = !hostSections;
  const searchVisible = Boolean(hostSections) || sidebarMode === "engineer";

  const firstMatch = filteredSections[0]?.items[0];

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setQuery("");
    } else if (e.key === "Enter" && firstMatch) {
      e.preventDefault();
      router.push(scopedHref(firstMatch.href));
      setQuery("");
    }
  };

  const width = collapsed ? "w-[72px]" : "w-[248px]";

  const renderLink = (item: NavItem, nested = false) => {
    const Icon = item.icon;
    const active = isNavItemActive(pathname, search, item);
    const link = (
      <Link
        href={scopedHref(item.href)}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        className={cn(
          "relative flex items-center gap-3.5 rounded-md text-body-sm transition-colors",
          "h-10 px-3.5",
          nested && "px-3",
          collapsed && "justify-center px-0",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", iconTintClass(item))} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {item.href === "/inbox" && (
          <InboxBadge
            enabled={enableInboxBadgeData}
            className={cn(collapsed ? "absolute top-1 right-1" : "ml-auto")}
          />
        )}
        {item.href === "/messages" && (
          <MessagesBadge
            enabled={enableMessagesBadgeData}
            className={cn(collapsed ? "absolute top-1 right-1" : "ml-auto")}
          />
        )}
        {item.href === "/reports" && (
          <ReportsBadge
            enabled={enableReportsBadgeData}
            className={cn(collapsed ? "absolute top-1 right-1" : "ml-auto")}
          />
        )}
      </Link>
    );
    return collapsed ? (
      <SimpleTooltip key={item.href} content={item.label} side="right">
        {link}
      </SimpleTooltip>
    ) : (
      <div key={item.href}>{link}</div>
    );
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r border-white/[0.06] bg-black/30",
        "h-full min-h-0 overflow-hidden z-30 transition-[width] duration-150 ease-out",
        width,
      )}
      aria-label="Primary navigation"
      data-hydrated={hydrated ? "true" : "false"}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-white/[0.06] px-3.5",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        <SimpleTooltip
          content={APP_VERSION ? `Kody v${APP_VERSION}` : "Kody"}
          side="right"
        >
          <Link
            href={scopedHref("/")}
            className="flex items-center gap-2 text-foreground hover:text-foreground/80"
            aria-label={
              APP_VERSION ? `Kody home (v${APP_VERSION})` : "Kody home"
            }
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-body-sm font-semibold text-white">
              K
            </div>
            {!collapsed && (
              <span className="truncate text-body-sm font-semibold tracking-tight">
                {brandLabel}
              </span>
            )}
          </Link>
        </SimpleTooltip>
        {brandRowExtra && !collapsed && (
          <div className="shrink-0">{brandRowExtra}</div>
        )}
      </div>

      {headerExtra && !collapsed && (
        <div className="shrink-0 border-b border-white/[0.06] px-2.5 py-2">
          {headerExtra}
        </div>
      )}

      <nav className="min-h-0 flex-1 flex flex-col py-3">
        <div
          data-sidebar-fixed-controls="true"
          className="shrink-0 space-y-1.5 px-2.5"
        >
          {pinnedItem && <div className="pb-2">{renderLink(pinnedItem)}</div>}

          {modeToggleVisible && (
            <div className="pb-2">
              {collapsed ? (
                <SimpleTooltip
                  content={
                    sidebarMode === "vibe"
                      ? "Switch to Engineer"
                      : "Switch to Vibe"
                  }
                  side="right"
                >
                  <button
                    type="button"
                    onClick={() =>
                      selectSidebarMode(
                        sidebarMode === "vibe" ? "engineer" : "vibe",
                      )
                    }
                    aria-label={
                      sidebarMode === "vibe"
                        ? "Switch to Engineer"
                        : "Switch to Vibe"
                    }
                    className="flex h-10 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    {sidebarMode === "vibe" ? (
                      <Wrench className="h-5 w-5 shrink-0" />
                    ) : (
                      <Sparkles className="h-5 w-5 shrink-0" />
                    )}
                  </button>
                </SimpleTooltip>
              ) : (
                <div
                  className="grid grid-cols-2 gap-1 rounded-md border border-white/[0.08] bg-black/20 p-1"
                  aria-label="Sidebar mode"
                >
                  <button
                    type="button"
                    onClick={() => selectSidebarMode("vibe")}
                    aria-pressed={sidebarMode === "vibe"}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded text-body-xs font-medium transition-colors",
                      sidebarMode === "vibe"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Vibe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSidebarMode("engineer")}
                    aria-pressed={sidebarMode === "engineer"}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded text-body-xs font-medium transition-colors",
                      sidebarMode === "engineer"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Wrench className="h-4 w-4 shrink-0" />
                    <span>Engineer</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Inline search — filters the rail's own items as you type. Collapsed
              mode shows an icon that expands the rail so there's room to type. */}
          {searchVisible && (
            <div className="pb-1">
              {collapsed ? (
                <SimpleTooltip content="Search" side="right">
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label="Search"
                    className="flex h-10 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  >
                    <Search className="h-5 w-5 shrink-0" />
                  </button>
                </SimpleTooltip>
              ) : (
                <div className="flex h-10 w-full items-center gap-2.5 rounded-md border border-white/[0.08] bg-black/20 px-3.5 text-body-sm transition-colors focus-within:border-white/[0.18]">
                  <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Search…"
                    aria-label="Search navigation"
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4 shrink-0" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          data-sidebar-scroll-list="true"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-4"
        >
          {/* Nav sections — ordered by the main work loop, sourced from the
              shared settings-nav so new pages appear here automatically. Filtered
              live by the inline search; section headings show only when expanded,
              collapsed mode is a flat icon list. */}
          {filteredSections.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            filteredSections.map((section, i) => {
              const sectionId = `sidebar-section-${i}`;
              const Icon = section.icon;
              const sectionActive =
                activeCollapsibleSectionTitle === section.title;
              const showItems =
                collapsed ||
                !section.collapsible ||
                Boolean(query.trim()) ||
                expandedSectionTitle === section.title;

              return (
                <div key={section.title} className="space-y-1">
                  {!collapsed && section.collapsible ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSectionTitle((current) =>
                          current === section.title ? null : section.title,
                        )
                      }
                      aria-controls={sectionId}
                      aria-expanded={showItems}
                      className={cn(
                        "flex h-10 w-full items-center gap-3.5 rounded-md px-3.5 text-body-sm transition-colors",
                        sectionActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            "h-5 w-5 shrink-0",
                            iconTintClass(section),
                          )}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-left">
                        {section.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform",
                          !showItems && "-rotate-90",
                        )}
                      />
                    </button>
                  ) : !collapsed ? (
                    <p className="px-3.5 pb-1 pt-3.5 text-label font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {section.title}
                    </p>
                  ) : null}
                  {collapsed && i > 0 && (
                    <div
                      className="my-2 mx-3 border-t border-white/[0.06]"
                      aria-hidden="true"
                    />
                  )}
                  {section.collapsible && !collapsed ? (
                    <div
                      id={sectionId}
                      aria-hidden={!showItems}
                      inert={!showItems}
                      className={cn(
                        "grid transition-[grid-template-rows] duration-150 ease-out",
                        showItems ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="ml-3 space-y-1 border-l border-white/[0.08] py-1 pl-1">
                          {section.items.map((item) => renderLink(item, true))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    showItems && (
                      <div id={sectionId} className="space-y-1">
                        {section.items.map((item) =>
                          renderLink(item, Boolean(section.collapsible)),
                        )}
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </nav>

      <div className="space-y-1 border-t border-white/[0.06] p-2.5">
        {/* GitHub identity — click to reveal connected repo + sign out.
            Persistent app chrome, moved here from the page header. */}
        {(githubUser || connectedRepo) && (
          <div className="relative">
            <SimpleTooltip
              content={
                githubUser
                  ? `@${githubUser.login}${connectedRepo ? ` · ${connectedRepo}` : ""}`
                  : (connectedRepo ?? "Connected")
              }
              side="right"
            >
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account"
                className={cn(
                  "flex h-10 w-full items-center gap-3.5 rounded-md px-3.5 text-body-sm transition-colors",
                  "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                {githubUser ? (
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarImage
                      src={githubUser.avatar_url}
                      alt={githubUser.login}
                    />
                    <AvatarFallback>
                      {githubUser.login[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Github className="h-5 w-5 shrink-0" />
                )}
                {!collapsed && (
                  <span className="truncate flex-1 text-left">
                    {githubUser ? `@${githubUser.login}` : "Connected"}
                  </span>
                )}
              </button>
            </SimpleTooltip>
            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 py-1 bg-popover border rounded-md shadow-lg z-50">
                {connectedRepo && (
                  <div className="mb-1 border-b px-3 py-2 text-body-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Repo:</span>{" "}
                    {connectedRepo}
                  </div>
                )}
                {githubUser ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearGitHubUser();
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sign out
                  </button>
                ) : (
                  <div className="px-3 py-2 text-body-xs text-muted-foreground">
                    No GitHub user signed in.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Theme toggle — global chrome, moved here from the page header. */}
        <SimpleTooltip
          content={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          side="right"
        >
          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className={cn(
              "flex h-10 w-full items-center gap-3.5 rounded-md px-3.5 text-body-sm",
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 shrink-0" />
            ) : (
              <Moon className="h-5 w-5 shrink-0" />
            )}
            {!collapsed && (
              <span className="truncate">
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </span>
            )}
          </button>
        </SimpleTooltip>

        <SimpleTooltip
          content={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          side="right"
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex h-10 w-full items-center gap-3.5 rounded-md px-3.5 text-body-sm",
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5 shrink-0" />
            ) : (
              <ChevronLeft className="h-5 w-5 shrink-0" />
            )}
            {!collapsed && <span className="truncate">Collapse</span>}
          </button>
        </SimpleTooltip>

        {(APP_VERSION || onReportIssue) && (
          <div
            className={cn(
              "flex items-center gap-2 pt-1",
              collapsed ? "justify-center px-0" : "justify-between px-3",
            )}
          >
            {APP_VERSION && (
              <p className="text-code-sm font-mono text-muted-foreground/50 select-none">
                v{APP_VERSION}
              </p>
            )}
            {onReportIssue && (
              <button
                type="button"
                onClick={onReportIssue}
                title="Report issue to Kody"
                aria-label="Report issue to Kody"
                className="inline-flex h-8 w-8 items-center justify-center rounded text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Bug className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
