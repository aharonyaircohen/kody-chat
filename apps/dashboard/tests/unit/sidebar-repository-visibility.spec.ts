import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
        title: "Customize",
        items: expect.arrayContaining([
          expect.objectContaining({ href: "/models" }),
          expect.objectContaining({ href: "/commands" }),
          expect.objectContaining({ href: "/secrets" }),
        ]),
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

  it("renders personal navigation and uses Kody sign-in state without a repository", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/dashboard/lib/components/ChatRailShell.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("sections={navSections}");
    expect(source).toContain("const bootstrapWelcome = !kodySession?.user");
    expect(source).toContain("Sign in to Kody");
  });
});
