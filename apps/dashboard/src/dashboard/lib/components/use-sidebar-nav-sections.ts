/**
 * @fileType hook
 * @domain kody
 * @pattern settings-nav
 * @ai-summary Sidebar nav sections extended with repository file spaces.
 *   CMS collections stay inside the Entries workspace instead of becoming
 *   global navigation items.
 */
"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import {
  SIDEBAR_NAV_SECTIONS,
  type SettingsNavItem,
  type SettingsNavSection,
} from "./settings-nav";
import { useFileSpaces } from "@dashboard/features/file-spaces/use-file-spaces";
import { useAuth } from "@dashboard/lib/auth-context";
import { PERSONAL_DASHBOARD_PATHS } from "@dashboard/lib/kody-scope";

const KNOWLEDGE_SECTION_TITLE = "Knowledge";
const DOCS_HREF = "/docs";
const PERSONAL_CHAT_HREFS = new Set(PERSONAL_DASHBOARD_PATHS);

export interface SidebarNavExtensions {
  customSpaceItems: readonly SettingsNavItem[];
  repositoryConnected?: boolean;
}

export function extendSidebarNavSections(
  sections: readonly SettingsNavSection[],
  { customSpaceItems, repositoryConnected = true }: SidebarNavExtensions,
): readonly SettingsNavSection[] {
  if (!repositoryConnected) {
    return [
      {
        title: "Customize",
        items: sections.flatMap((section) =>
          section.items.filter((item) => PERSONAL_CHAT_HREFS.has(item.href)),
        ),
      },
    ];
  }
  return sections.map((section) => {
    if (section.title === KNOWLEDGE_SECTION_TITLE && customSpaceItems.length) {
      const docsIndex = section.items.findIndex(
        (item) => item.href === DOCS_HREF,
      );
      const insertAt = docsIndex === -1 ? section.items.length : docsIndex + 1;
      return {
        ...section,
        items: [
          ...section.items.slice(0, insertAt),
          ...customSpaceItems,
          ...section.items.slice(insertAt),
        ],
      };
    }
    return section;
  });
}

export function useSidebarNavSections(): readonly SettingsNavSection[] {
  const { auth } = useAuth();
  const fileSpacesQuery = useFileSpaces();

  return useMemo(() => {
    const customSpaceItems: SettingsNavItem[] = (
      fileSpacesQuery.data?.spaces ?? []
    )
      .filter((space) => !space.builtIn)
      .map((space) => ({
        href: `/file-spaces/${space.slug}`,
        label: space.title,
        icon: FileText,
        description: `Markdown files from /${space.rootPath}.`,
        tint: "text-amber-300 bg-amber-500/10",
      }));
    const scopedSections = SIDEBAR_NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.map((item) =>
        PERSONAL_CHAT_HREFS.has(item.href)
          ? { ...item, scope: "personal" as const }
          : item,
      ),
    }));
    return extendSidebarNavSections(scopedSections, {
      customSpaceItems,
      repositoryConnected: Boolean(auth?.owner && auth.repo),
    });
  }, [auth?.owner, auth?.repo, fileSpacesQuery.data]);
}
