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
import { FileText, UserRound } from "lucide-react";
import {
  HOME_NAV_ITEM,
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
  personalHomeItem?: SettingsNavItem;
}

export function extendSidebarNavSections(
  sections: readonly SettingsNavSection[],
  {
    customSpaceItems,
    repositoryConnected = true,
    personalHomeItem,
  }: SidebarNavExtensions,
): readonly SettingsNavSection[] {
  const allItems = [
    personalHomeItem,
    ...sections.flatMap((section) => section.items),
  ];
  const personalItems = PERSONAL_DASHBOARD_PATHS.map((href) =>
    allItems.find((item) => item?.href === href),
  ).filter((item): item is SettingsNavItem => Boolean(item));
  const personalSection: SettingsNavSection = {
    contextLabel: "Account",
    title: "Personal",
    icon: UserRound,
    tint: "text-fuchsia-300",
    collapsible: true,
    items: personalItems.map((item) => ({ ...item, scope: "personal" })),
  };
  if (!repositoryConnected) return [personalSection];

  const repositorySections = sections
    .map((section) => {
      const repositoryItems = section.items.filter(
        (item) => !PERSONAL_CHAT_HREFS.has(item.href),
      );
      if (
        section.title === KNOWLEDGE_SECTION_TITLE &&
        customSpaceItems.length
      ) {
        const docsIndex = repositoryItems.findIndex(
          (item) => item.href === DOCS_HREF,
        );
        const insertAt =
          docsIndex === -1 ? repositoryItems.length : docsIndex + 1;
        return {
          ...section,
          items: [
            ...repositoryItems.slice(0, insertAt),
            ...customSpaceItems,
            ...repositoryItems.slice(insertAt),
          ],
        };
      }
      return { ...section, items: repositoryItems };
    })
    .filter((section) => section.items.length > 0);
  if (repositorySections[0]) {
    repositorySections[0] = {
      ...repositorySections[0],
      contextLabel: "Repository",
    };
  }
  return [personalSection, ...repositorySections];
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
    return extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
      customSpaceItems,
      repositoryConnected: Boolean(auth?.owner && auth.repo),
      personalHomeItem: HOME_NAV_ITEM,
    });
  }, [auth?.owner, auth?.repo, fileSpacesQuery.data]);
}
