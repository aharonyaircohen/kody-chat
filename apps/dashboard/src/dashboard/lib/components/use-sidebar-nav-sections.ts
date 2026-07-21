/**
 * @fileType hook
 * @domain kody
 * @pattern settings-nav
 * @ai-summary Sidebar nav sections with dynamic CMS collections. Extends the
 *   static SIDEBAR_NAV_SECTIONS by listing each configured content collection
 *   under the Content group, linking to its /content/entries/<name> page.
 *   Shares the ["cms-config", scope] react-query cache with CmsManager.
 */
"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, FileText } from "lucide-react";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { fetchCmsConfig } from "@dashboard/features/admin/components/cms/client";
import {
  SIDEBAR_NAV_SECTIONS,
  type SettingsNavItem,
  type SettingsNavSection,
} from "./settings-nav";
import { useFileSpaces } from "@dashboard/features/file-spaces/use-file-spaces";

const CONTENT_SECTION_TITLE = "Content";

export function useSidebarNavSections(): readonly SettingsNavSection[] {
  const { auth } = useAuth();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const scope = `${auth?.owner ?? ""}/${auth?.repo ?? ""}`;
  const fileSpacesQuery = useFileSpaces();

  const cmsQuery = useQuery({
    queryKey: ["cms-config", scope] as const,
    queryFn: () => fetchCmsConfig(headers),
    enabled: Boolean(auth),
    staleTime: 60_000,
    retry: false,
  });

  return useMemo(() => {
    const cms = cmsQuery.data;
    const collectionItems: SettingsNavItem[] = (cms?.configured ? cms.collections : []).map(
      (collection) => ({
        href: `/content/entries/${encodeURIComponent(collection.name)}`,
        label: collection.label,
        icon: Database,
        description: `Browse ${collection.label} entries.`,
        tint: "text-emerald-300 bg-emerald-500/10",
      }),
    );
    const customSpaceItems: SettingsNavItem[] = (fileSpacesQuery.data?.spaces ?? [])
      .filter((space) => !space.builtIn)
      .map((space) => ({
        href: `/file-spaces/${space.slug}`,
        label: space.title,
        icon: FileText,
        description: `Markdown files from /${space.rootPath}.`,
        tint: "text-amber-300 bg-amber-500/10",
      }));
    return SIDEBAR_NAV_SECTIONS.map((section) => {
      if (section.title === CONTENT_SECTION_TITLE && collectionItems.length) {
        return { ...section, items: [...section.items, ...collectionItems] };
      }
      if (section.title === "Workspace" && customSpaceItems.length) {
        return { ...section, items: [...section.items, ...customSpaceItems] };
      }
      return section;
    });
  }, [cmsQuery.data, fileSpacesQuery.data]);
}
