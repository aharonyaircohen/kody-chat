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

const KNOWLEDGE_SECTION_TITLE = "Knowledge";
const DOCS_HREF = "/docs";

export interface SidebarNavExtensions {
  customSpaceItems: readonly SettingsNavItem[];
}

export function extendSidebarNavSections(
  sections: readonly SettingsNavSection[],
  { customSpaceItems }: SidebarNavExtensions,
): readonly SettingsNavSection[] {
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
    return extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
      customSpaceItems,
    });
  }, [fileSpacesQuery.data]);
}
