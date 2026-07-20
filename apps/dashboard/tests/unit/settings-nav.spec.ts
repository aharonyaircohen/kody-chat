import { describe, expect, it } from "vitest";

import {
  SIDEBAR_NAV_SECTIONS,
  PRIMARY_NAV_ITEMS,
  SETTINGS_NAV_SECTIONS,
  activeCollapsibleNavSectionTitle,
  navLabelForPath,
  type SettingsNavSection,
} from "@dashboard/lib/components/settings-nav";

function exposedHrefs(): string[] {
  return [
    ...PRIMARY_NAV_ITEMS.map((item) => item.href),
    ...SETTINGS_NAV_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.href),
    ),
  ];
}

function sectionHrefs(
  sections: readonly SettingsNavSection[],
  title: string,
): string[] {
  return (
    sections
      .find((section) => section.title === title)
      ?.items.map((item) => item.href) ?? []
  );
}

describe("settings navigation", () => {
  it("exposes reports and inbox without legacy trust or ledger sections", () => {
    const hrefs = exposedHrefs();

    expect(hrefs).toContain("/reports");
    expect(hrefs).toContain("/inbox");
    expect(hrefs).not.toContain("/trust");
    expect(hrefs).not.toContain("/ledgers");

    expect(navLabelForPath("/reports")).toBe("Reports");
    expect(navLabelForPath("/inbox")).toBe("Inbox");
    expect(navLabelForPath("/trust")).toBeNull();
    expect(navLabelForPath("/ledgers")).toBeNull();
  });

  it("keeps findings and learning inside Reports instead of separate navigation", () => {
    expect(sectionHrefs(SETTINGS_NAV_SECTIONS, "AI Agency")).not.toContain(
      "/findings",
    );
    expect(sectionHrefs(SETTINGS_NAV_SECTIONS, "AI Agency")).not.toContain(
      "/learning",
    );
    expect(navLabelForPath("/findings")).toBeNull();
    expect(navLabelForPath("/learning")).toBeNull();
  });

  it("exposes Fly config, previews, Brain images, live machines, and history as separate pages", () => {
    expect(sectionHrefs(SETTINGS_NAV_SECTIONS, "Fly")).toEqual([
      "/fly/config",
      "/fly/previews",
      "/fly/brain-images",
      "/fly/machines",
      "/fly/history",
    ]);
    expect(navLabelForPath("/fly/config")).toBe("Config");
    expect(navLabelForPath("/fly/previews")).toBe("Previews");
    expect(navLabelForPath("/fly/brain-images")).toBe("Brain Images");
    expect(navLabelForPath("/fly/machines")).toBe("Live machines");
    expect(navLabelForPath("/fly/history")).toBe("History");
    expect(navLabelForPath("/terminal")).toBeNull();
  });

  it("groups content entries, models, and settings into one side-panel section", () => {
    expect(sectionHrefs(SETTINGS_NAV_SECTIONS, "Content")).toEqual([
      "/content/entries",
      "/content/models",
      "/snippets",
      "/triggers",
      "/content/settings",
    ]);
    expect(navLabelForPath("/content/entries")).toBe("Entries");
    expect(navLabelForPath("/content/models")).toBe("Models");
    expect(navLabelForPath("/content/settings")).toBe("Settings");
  });

  it("keeps Dashboard as the only attention-style home entry", () => {
    expect(navLabelForPath("/")).toBe("Dashboard");
    expect(navLabelForPath("/attention")).toBeNull();
    expect(sectionHrefs(SIDEBAR_NAV_SECTIONS, "Work")).toEqual([
      "/tasks",
      "/vibe",
      "/preview",
      "/todos",
      "/inbox",
      "/agency-runs",
    ]);
  });

  it("keeps Views active for selected saved preview routes", () => {
    const previewHref = "/preview";
    const previewItem = sectionHrefs(SIDEBAR_NAV_SECTIONS, "Work")
      .map((href) =>
        SIDEBAR_NAV_SECTIONS.flatMap((section) => section.items).find(
          (item) => item.href === href,
        ),
      )
      .find((item) => item?.href === previewHref);

    expect(previewItem?.label).toBe("Views");
    expect(previewItem?.exact).toBeUndefined();
    expect(navLabelForPath("/preview/dev-4ojw")).toBe("Views");
  });

  it("shows Intent, Operation, and owned work in scaling order", () => {
    const agency = sectionHrefs(SIDEBAR_NAV_SECTIONS, "Agency");
    expect(agency.indexOf("/company-intents")).toBeLessThan(
      agency.indexOf("/operations"),
    );
    expect(agency.indexOf("/operations")).toBeLessThan(
      agency.indexOf("/agent-goals"),
    );
    expect(navLabelForPath("/operations")).toBe("Operations");
  });

  it("orders the desktop rail around work and collapsible ownership groups", () => {
    expect(SIDEBAR_NAV_SECTIONS.map((section) => section.title)).toEqual([
      "Work",
      "Agency",
      "Quality",
      "Workspace",
      "Content",
      "Chat",
      "Client",
      "System",
    ]);
    expect(sectionHrefs(SIDEBAR_NAV_SECTIONS, "Work")).toEqual([
      "/tasks",
      "/vibe",
      "/preview",
      "/todos",
      "/inbox",
      "/agency-runs",
    ]);
    expect(sectionHrefs(SIDEBAR_NAV_SECTIONS, "Agency")).toEqual([
      "/agents",
      "/company-intents",
      "/operations",
      "/agent-goals",
      "/agent-loops",
      "/workflows",
      "/guided-flows",
      "/capabilities",
      "/store-catalog",
      "/company",
    ]);
    expect(SIDEBAR_NAV_SECTIONS.every((section) => section.collapsible)).toBe(
      true,
    );
    expect(SIDEBAR_NAV_SECTIONS.every((section) => section.icon)).toBe(true);
    expect(SIDEBAR_NAV_SECTIONS.every((section) => section.tint)).toBe(true);
  });

  it("opens only the active collapsible parent for a nested route", () => {
    expect(
      activeCollapsibleNavSectionTitle(
        SIDEBAR_NAV_SECTIONS,
        "/agent-goals",
        "",
      ),
    ).toBe("Agency");
    expect(
      activeCollapsibleNavSectionTitle(SIDEBAR_NAV_SECTIONS, "/memory", ""),
    ).toBe("Chat");
    expect(
      activeCollapsibleNavSectionTitle(SIDEBAR_NAV_SECTIONS, "/tasks", ""),
    ).toBe("Work");
  });

  it("does not expose the redundant settings page", () => {
    expect(sectionHrefs(SIDEBAR_NAV_SECTIONS, "System")).not.toContain(
      "/settings",
    );
    expect(exposedHrefs()).not.toContain("/settings");
    expect(navLabelForPath("/settings")).toBeNull();
  });
});
