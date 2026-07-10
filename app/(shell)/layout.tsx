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
import { terminalChatPlugin } from "@dashboard/lib/chat/plugins/terminal/plugin";

const CHAT_HOME: SettingsNavItem = {
  href: "/",
  label: "Chat",
  icon: MessageSquare,
  exact: true,
};

const BUILTIN_SECTIONS: readonly SettingsNavSection[] = [
  {
    title: "Chat setup",
    items: [
      { href: "/models", label: "Models", icon: Boxes },
      { href: "/secrets", label: "Secrets", icon: KeyRound },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/brands", label: "Brands", icon: Palette },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { href: "/commands", label: "Commands", icon: SlashSquare },
      { href: "/context", label: "Context", icon: BookOpen },
      { href: "/memory", label: "Memory", icon: Brain },
      { href: "/instructions", label: "Instructions", icon: FileText },
    ],
  },
];

const CHAT_PLUGINS = [
  { plugin: commandsChatPlugin },
  { plugin: terminalChatPlugin },
];

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
