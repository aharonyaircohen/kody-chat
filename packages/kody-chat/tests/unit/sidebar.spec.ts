import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  resolve(__dirname, "../../src/dashboard/lib/components/Sidebar.tsx"),
  "utf8",
);

describe("Sidebar navigation items", () => {
  it("sources nav sections from the shared settings-nav list", () => {
    expect(SOURCE).toContain(
      'from "@dashboard/lib/components/settings-nav"',
    );
    expect(SOURCE).toContain("hostSections ?? SIDEBAR_NAV_SECTIONS");
  });

  it("pins the Dashboard item by default while letting hosts override it", () => {
    expect(SOURCE).toContain("pinnedItem = DASHBOARD_NAV_ITEM");
    expect(SOURCE).toContain("pinnedItem?: SettingsNavItem | null");
  });

  it("scopes nav hrefs to the connected repo when authenticated", () => {
    expect(SOURCE).toContain(
      "auth ? repoScopedHref(auth, href) : href",
    );
  });

  it("renders the special badges only on their matching routes", () => {
    expect(SOURCE).toContain('item.href === "/inbox"');
    expect(SOURCE).toContain('item.href === "/messages"');
    expect(SOURCE).toContain('item.href === "/reports"');
  });
});

describe("Sidebar active state", () => {
  it("derives active state from the shared isNavItemActive helper", () => {
    expect(SOURCE).toContain("isNavItemActive(pathname, search, item)");
  });

  it("marks the active link for assistive tech with aria-current", () => {
    expect(SOURCE).toContain('aria-current={active ? "page" : undefined}');
  });

  it("auto-expands the collapsible section containing the active route", () => {
    expect(SOURCE).toContain(
      "activeCollapsibleNavSectionTitle(baseSections, pathname, search)",
    );
    expect(SOURCE).toContain(
      "setExpandedSectionTitle(activeCollapsibleSectionTitle)",
    );
  });
});

describe("Sidebar collapse behavior", () => {
  it("persists the collapsed state under the kody.sidebar.collapsed key", () => {
    expect(SOURCE).toContain('const COLLAPSED_KEY = "kody.sidebar.collapsed"');
    expect(SOURCE).toContain(
      'window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")',
    );
    expect(SOURCE).toContain(
      'window.localStorage.getItem(COLLAPSED_KEY) === "1"',
    );
  });

  it("survives localStorage being unavailable (private mode)", () => {
    // Both the read and the write are wrapped in try/catch.
    const catches = SOURCE.match(/} catch \{/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(2);
  });

  it("never collapses the mobile presentation", () => {
    expect(SOURCE).toContain("const isCollapsed = mobile ? false : collapsed");
  });

  it("hides the collapse toggle on mobile", () => {
    expect(SOURCE).toContain("{!mobile && (");
    expect(SOURCE).toContain('isCollapsed ? "Expand sidebar" : "Collapse sidebar"');
  });

  it("shows tooltips for icon-only links while collapsed", () => {
    expect(SOURCE).toContain(
      '<SimpleTooltip key={item.href} content={item.label} side="right">',
    );
  });

  it("expands the rail when the collapsed search icon is clicked", () => {
    expect(SOURCE).toContain('aria-label="Search"');
    expect(SOURCE).toContain("onClick={toggleCollapsed}");
  });
});

describe("Sidebar inline search", () => {
  it("filters items by label and description, dropping empty sections", () => {
    expect(SOURCE).toContain(
      "`${item.label} ${item.description ?? \"\"}`.toLowerCase().includes(q)",
    );
    expect(SOURCE).toContain(
      ".filter((section) => section.items.length > 0)",
    );
  });

  it("clears the query on Escape and navigates to the first match on Enter", () => {
    expect(SOURCE).toContain('if (e.key === "Escape")');
    expect(SOURCE).toContain('e.key === "Enter" && firstMatch');
    expect(SOURCE).toContain("router.push(scopedHref(firstMatch.href))");
  });

  it("shows an empty state when no items match", () => {
    expect(SOURCE).toContain("filteredSections.length === 0");
    expect(SOURCE).toContain("No matches.");
  });
});

describe("Sidebar navigation callback", () => {
  it("invokes onNavigate when a link is clicked so mobile sheets can close", () => {
    expect(SOURCE).toContain("onClick={onNavigate}");
    expect(SOURCE).toContain("onNavigate?.()");
  });
});
