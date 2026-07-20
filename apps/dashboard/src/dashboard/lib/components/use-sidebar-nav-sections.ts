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
import { Database } from "lucide-react";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { fetchCmsConfig } from "@dashboard/features/admin/components/cms/client";
import {
  SIDEBAR_NAV_SECTIONS,
  type SettingsNavItem,
  type SettingsNavSection,
} from "./settings-nav";

const CONTENT_SECTION_TITLE = "Content";

export function useSidebarNavSections(): readonly SettingsNavSection[] {
  const { auth } = useAuth();
  const headers = useMemo(() => buildAuthHeaders(auth), [auth]);
  const scope = `${auth?.owner ?? ""}/${auth?.repo ?? ""}`;

  const cmsQuery = useQuery({
    queryKey: ["cms-config", scope] as const,
    queryFn: () => fetchCmsConfig(headers),
    enabled: Boolean(auth),
    staleTime: 60_000,
    retry: false,
  });

  return useMemo(() => {
    const cms = cmsQuery.data;
    if (!cms || !cms.configured || cms.collections.length === 0) {
      return SIDEBAR_NAV_SECTIONS;
    }
    const collectionItems: SettingsNavItem[] = cms.collections.map(
      (collection) => ({
        href: `/content/entries/${encodeURIComponent(collection.name)}`,
        label: collection.label,
        icon: Database,
        description: `Browse ${collection.label} entries.`,
        tint: "text-emerald-300 bg-emerald-500/10",
      }),
    );
    return SIDEBAR_NAV_SECTIONS.map((section) =>
      section.title === CONTENT_SECTION_TITLE
        ? { ...section, items: [...section.items, ...collectionItems] }
        : section,
    );
  }, [cmsQuery.data]);
}
