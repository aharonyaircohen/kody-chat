import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extendSidebarNavSections } from "@dashboard/lib/components/use-sidebar-nav-sections";
import { SIDEBAR_NAV_SECTIONS } from "@dashboard/lib/components/settings-nav";
import { HOME_NAV_ITEM } from "@dashboard/lib/components/settings-nav";

describe("repository navigation visibility", () => {
  it("keeps one ordered personal group while hiding repository navigation", () => {
    const sections = extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
      customSpaceItems: [],
      repositoryConnected: false,
      personalHomeItem: HOME_NAV_ITEM,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      contextLabel: "Account",
      title: "Personal",
      collapsible: true,
    });
    expect(sections[0]?.items.map((item) => item.href)).toEqual([
      "/chat",
      "/models",
      "/commands",
      "/guided-flows",
      "/views/renderers",
      "/views/widgets",
      "/instructions",
      "/secrets",
      "/memory",
    ]);
    expect(sections[0]?.items.every((item) => item.scope === "personal")).toBe(
      true,
    );
  });

  it("separates personal destinations from repository navigation", () => {
    const sections = extendSidebarNavSections(SIDEBAR_NAV_SECTIONS, {
      customSpaceItems: [],
      repositoryConnected: true,
      personalHomeItem: HOME_NAV_ITEM,
    });

    expect(sections[0]).toMatchObject({
      contextLabel: "Account",
      title: "Personal",
    });
    expect(sections[1]?.contextLabel).toBe("Repository");
    expect(
      sections
        .slice(1)
        .flatMap((section) => section.items)
        .some((item) => item.scope === "personal"),
    ).toBe(false);
  });

  it("renders personal navigation and uses Kody sign-in state without a repository", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/dashboard/lib/components/ChatRailShell.tsx"),
      "utf8",
    );

    expect(source).toContain("sections={navSections}");
    expect(source).toContain("Boolean(kodySession?.user)");
    expect(source).toContain("pinnedItem={null}");
  });
});
