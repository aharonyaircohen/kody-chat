import { describe, expect, it } from "vitest";

import {
  PREVIEW_NAV_ITEM,
  SETTINGS_NAV_SECTIONS,
  TASKS_NAV_ITEM,
  isNavItemActive,
  navLabelForPath,
  type SettingsNavItem,
} from "@dashboard/lib/components/settings-nav";

const itemByHref = (href: string): SettingsNavItem => {
  const item = SETTINGS_NAV_SECTIONS.flatMap((section) => section.items).find(
    (candidate) => candidate.href === href,
  );
  if (!item) throw new Error(`Missing nav item ${href}`);
  return item;
};

describe("sidebar active route matching", () => {
  it("keeps detail pages selected under their side panel item", () => {
    expect(
      isNavItemActive("/agent-goals/goal-1", "", itemByHref("/agent-goals")),
    ).toBe(true);
    expect(
      isNavItemActive("/agent-loops/loop-1", "", itemByHref("/agent-loops")),
    ).toBe(true);
    expect(
      isNavItemActive("/workflows/workflow-1", "", itemByHref("/workflows")),
    ).toBe(true);
    expect(
      isNavItemActive(
        "/capabilities/build-preview",
        "",
        itemByHref("/capabilities"),
      ),
    ).toBe(true);
    expect(
      isNavItemActive(
        "/store-catalog/capability/build-preview",
        "",
        itemByHref("/store-catalog"),
      ),
    ).toBe(true);
  });

  it("keeps task detail pages selected under Tasks", () => {
    expect(isNavItemActive("/123", "", TASKS_NAV_ITEM)).toBe(true);
    expect(isNavItemActive("/123/comments", "", TASKS_NAV_ITEM)).toBe(true);
    expect(isNavItemActive("/123/preview/docs", "", TASKS_NAV_ITEM)).toBe(true);
  });

  it("does not lose selected state when an exact page has query params", () => {
    expect(
      isNavItemActive("/agent-goals", "view=mine", itemByHref("/agent-goals")),
    ).toBe(true);
  });

  it("keeps Views selected for dynamic preview pages", () => {
    expect(isNavItemActive("/preview/dev-4ojw", "", PREVIEW_NAV_ITEM)).toBe(
      true,
    );
    expect(navLabelForPath("/preview/dev-4ojw")).toBe("Views");
  });

  it("resolves labels for side panel detail routes", () => {
    expect(navLabelForPath("/123/preview/docs")).toBe("Tasks");
    expect(navLabelForPath("/agent-goals/goal-1")).toBe("Goals");
    expect(navLabelForPath("/store-catalog/capability/build-preview")).toBe(
      "Store Catalog",
    );
  });
});
