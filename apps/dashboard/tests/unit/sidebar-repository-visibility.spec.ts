import { describe, expect, it } from "vitest";
import {
  extendSidebarNavSections,
} from "@dashboard/lib/components/use-sidebar-nav-sections";
import { SIDEBAR_NAV_SECTIONS } from "@dashboard/lib/components/settings-nav";

describe("repository navigation visibility", () => {
  it("keeps personal models while hiding repository-only navigation", () => {
    expect(
      extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
        customSpaceItems: [],
        repositoryConnected: false,
      }),
    ).toEqual([
      expect.objectContaining({
        title: "Chat",
        items: [expect.objectContaining({ href: "/models" })],
      }),
    ]);
  });

  it("keeps repository navigation when a repository is connected", () => {
    expect(
      extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
        customSpaceItems: [],
        repositoryConnected: true,
      }),
    ).toHaveLength(SIDEBAR_NAV_SECTIONS.length);
  });
});
