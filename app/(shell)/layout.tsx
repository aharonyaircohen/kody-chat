/**
 * @fileType layout
 * @domain kody-chat
 * @pattern shell-layout
 * @ai-summary Operator surface: mounts the shared ChatShell (the dashboard's
 *   real Sidebar + persistent chat) with kody-chat's built-in pages. Client
 *   brand pages (/client/<slug>) stay outside this group.
 */
"use client";

import {
  BookOpen,
  Boxes,
  Brain,
  FileText,
  KeyRound,
  Languages,
  MessageSquare,
  Palette,
  Settings,
  SlashSquare,
} from "lucide-react";
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ChatShell } from "@dashboard/lib/components/ChatShell";
import type {
  SettingsNavItem,
  SettingsNavSection,
} from "@dashboard/lib/components/settings-nav";
import { commandsChatPlugin } from "@dashboard/lib/chat/plugins/commands";

const CHAT_HOME: SettingsNavItem = {
  href: "/",
  label: "Chat",
  icon: MessageSquare,
  exact: true,
  tint: "text-emerald-300 bg-emerald-500/10",
};

// Icon tints match the dashboard's palette for the same pages.
const BUILTIN_SECTIONS: readonly SettingsNavSection[] = [
  {
    title: "Chat setup",
    items: [
      {
        href: "/models",
        label: "Models",
        icon: Boxes,
        tint: "text-emerald-300 bg-emerald-500/10",
      },
      {
        href: "/secrets",
        label: "Secrets",
        icon: KeyRound,
        tint: "text-rose-300 bg-rose-500/10",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        tint: "text-sky-300 bg-sky-500/10",
      },
      {
        href: "/brands",
        label: "Brands",
        icon: Palette,
        tint: "text-cyan-300 bg-cyan-500/10",
      },
      {
        href: "/languages",
        label: "Languages",
        icon: Languages,
        tint: "text-amber-300 bg-amber-500/10",
      },
    ],
  },
  {
    title: "Knowledge",
    items: [
      {
        href: "/commands",
        label: "Commands",
        icon: SlashSquare,
        tint: "text-violet-300 bg-violet-500/10",
      },
      {
        href: "/context",
        label: "Context",
        icon: BookOpen,
        tint: "text-teal-300 bg-teal-500/10",
      },
      {
        href: "/memory",
        label: "Memory",
        icon: Brain,
        tint: "text-fuchsia-300 bg-fuchsia-500/10",
      },
      {
        href: "/instructions",
        label: "Instructions",
        icon: FileText,
        tint: "text-cyan-300 bg-cyan-500/10",
      },
    ],
  },
];

// Terminal is a DASHBOARD plugin — kody-chat's operator chat ships without it.
const CHAT_PLUGINS = [{ plugin: commandsChatPlugin }];

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <ChatShell
        sections={BUILTIN_SECTIONS}
        pinnedItem={CHAT_HOME}
        chatPlugins={CHAT_PLUGINS}
      >
        {children}
      </ChatShell>
    </AuthGuard>
  );
}
