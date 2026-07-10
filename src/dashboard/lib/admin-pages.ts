/**
 * @fileType module
 * @domain chat-platform
 * @pattern admin-page-registry
 * @ai-summary Registry of package-owned admin pages. A host app consumes this
 *   once (sidebar entries, rail panel map, repo-owned route prefixes, nav
 *   aliases) so shipping a new package page needs no per-feature host glue —
 *   only a tarball refresh. Route handlers ship separately via the
 *   `./routes/*` package exports.
 */
import { Languages, type LucideIcon } from "lucide-react";
import type { ChatPlugin } from "./chat/platform";
import {
  languagesChatPlugin,
  LANGUAGES_PANEL_ID,
} from "./chat/plugins/languages";

export interface PackageAdminPage {
  /** Route prefix the host mounts the page under (also the nav href). */
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind tint classes for the host sidebar chip. */
  tint: string;
  /** Page-plugin contributing the rail panel. */
  plugin: ChatPlugin;
  panelId: string;
  /** Phrases the host's assistant-navigation layer matches on. */
  aliases: string[];
  when: string;
}

export const PACKAGE_ADMIN_PAGES: readonly PackageAdminPage[] = [
  {
    href: "/languages",
    label: "Languages",
    description: "Client chat translations for /client surfaces.",
    icon: Languages,
    tint: "text-amber-300 bg-amber-500/10",
    plugin: languagesChatPlugin,
    panelId: LANGUAGES_PANEL_ID,
    aliases: ["languages", "translations", "locales"],
    when: "Use when the user asks to manage client chat languages or translations.",
  },
];
