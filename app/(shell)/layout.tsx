/**
 * @fileType layout
 * @domain kody-chat
 * @pattern shell-layout
 * @ai-summary Operator surface: mounts the shared ChatShell with kody-chat's
 *   built-in pages. Client brand pages (/client/<slug>) stay outside this
 *   group and keep their own chrome.
 */
"use client";

import {
  BookOpen,
  Boxes,
  Brain,
  FileText,
  KeyRound,
  Palette,
  Settings,
  SlashSquare,
} from "lucide-react";
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { ChatShell, type ShellPage } from "@dashboard/lib/components/ChatShell";
import { commandsChatPlugin } from "@dashboard/lib/chat/plugins/commands";
import { terminalChatPlugin } from "@dashboard/lib/chat/plugins/terminal/plugin";

const BUILTIN_PAGES: ShellPage[] = [
  { href: "/models", title: "Models", icon: Boxes },
  { href: "/secrets", title: "Secrets", icon: KeyRound },
  { href: "/settings", title: "Settings", icon: Settings },
  { href: "/brands", title: "Brands", icon: Palette },
  { href: "/commands", title: "Commands", icon: SlashSquare },
  { href: "/context", title: "Context", icon: BookOpen },
  { href: "/memory", title: "Memory", icon: Brain },
  { href: "/instructions", title: "Instructions", icon: FileText },
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
      <ChatShell pages={BUILTIN_PAGES} chatPlugins={CHAT_PLUGINS}>
        {children}
      </ChatShell>
    </AuthGuard>
  );
}
