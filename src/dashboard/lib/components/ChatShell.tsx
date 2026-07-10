/**
 * @fileType component
 * @domain kody-chat
 * @pattern chat-shell
 * @ai-summary Shared operator shell for the kody-chat product: persistent
 *   KodyChat + collapsible sidepanel of page-plugins + chrome (user chip,
 *   theme toggle, version badge). kody-chat mounts it with the built-in
 *   pages (models, secrets, settings, brands, commands, context, memory,
 *   instructions); hosts like the dashboard EXTEND it by passing more
 *   pages/plugins — they never fork the shell.
 */
"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Zap,
} from "lucide-react";
import type { ChatPlugin } from "@dashboard/lib/chat/platform/types";
import { KodyChat } from "./KodyChat";
import { useAuth } from "../auth-context";
import { ThemeSelector } from "@dashboard/providers/Theme/ThemeSelector";
import { cn } from "../utils";

const COLLAPSE_KEY = "kody-chat:shell-collapsed";

/** One sidepanel entry: a route that renders a plugin's panel view. */
export interface ShellPage {
  href: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
}

export interface ChatShellProps {
  /** Product name shown in the shell header. */
  title?: string;
  /** Sidepanel entries. Hosts extend the shell by adding entries here. */
  pages: ShellPage[];
  /** Plugins registered on the persistent chat mount. */
  chatPlugins?: Array<{ plugin: ChatPlugin }>;
  /** Version badge (defaults to the build-time app version). */
  version?: string;
  /** Extra chrome a host wants in the header (right side). */
  headerExtra?: ReactNode;
  /** Routed page content. On the chat home route pass nothing. */
  children?: ReactNode;
}

export function ChatShell({
  title = "Kody Chat",
  pages,
  chatPlugins,
  version = process.env.NEXT_PUBLIC_APP_VERSION,
  headerExtra,
  children,
}: ChatShellProps) {
  const pathname = usePathname() ?? "/";
  const { auth } = useAuth();
  const isChatHome = pathname === "/";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // private mode — leave expanded
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {
        // best-effort persistence only
      }
      return !prev;
    });
  };

  const navItems = useMemo(
    () => [{ href: "/", title: "Chat", icon: MessageSquare }, ...pages],
    [pages],
  );

  return (
    <div
      data-testid="chat-shell"
      className="flex h-dvh min-h-dvh flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Zap className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold">{title}</span>
          {version ? (
            <span
              data-testid="shell-version"
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              v{version}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {headerExtra}
          <ThemeSelector />
          {auth?.user ? (
            <span
              data-testid="shell-user"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {auth.user.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- external avatar host
                <img
                  src={auth.user.avatar_url}
                  alt=""
                  className="h-6 w-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <span className="hidden max-w-32 truncate sm:block">
                {auth.user.login}
              </span>
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          data-testid="shell-sidepanel"
          className={cn(
            "flex shrink-0 flex-col justify-between border-e border-border py-2 transition-[width]",
            collapsed ? "w-12" : "w-52",
          )}
        >
          <ul className="min-h-0 space-y-0.5 overflow-y-auto px-2">
            {navItems.map((page) => {
              const active =
                page.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(page.href);
              const Icon = page.icon;
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    title={page.title}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                    {!collapsed && <span className="truncate">{page.title}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="px-2">
            <button
              type="button"
              data-testid="shell-collapse-toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidepanel" : "Collapse sidepanel"}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4 shrink-0" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </nav>

        {!isChatHome && (
          <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        )}

        <aside
          aria-label="Kody chat"
          className={cn(
            "min-h-0 flex-col",
            isChatHome
              ? "flex min-w-0 flex-1"
              : "hidden w-[26rem] shrink-0 border-s border-border xl:flex",
          )}
        >
          <KodyChat
            presentation="standalone"
            compactHeader
            railFullscreen
            plugins={chatPlugins}
          />
        </aside>
      </div>
    </div>
  );
}
