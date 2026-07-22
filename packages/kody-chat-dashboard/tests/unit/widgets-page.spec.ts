/**
 * Source-level regression tests for the widgets management surface.
 *
 * @testFramework vitest
 * @domain unit
 */
import { existsSync, readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("widgets management page", () => {
  it("has a routed Dashboard page, API, and nav entry", () => {
    expect(existsSync("app/(shell)/views/widgets/page.tsx")).toBe(true);
    expect(existsSync("app/api/kody/widgets/route.ts")).toBe(true);
    expect(existsSync("app/api/kody/widgets/[slug]/route.ts")).toBe(true);
    expect(
      existsSync("src/dashboard/lib/components/WidgetsManager.tsx"),
    ).toBe(true);

    const exports = JSON.parse(readFileSync("package.json", "utf8")) as {
      exports: Record<string, string>;
    };
    expect(exports.exports["./routes/kody/widgets"]).toBe(
      "./app/api/kody/widgets/route.ts",
    );

    const nav = readFileSync(
      "src/dashboard/lib/components/settings-nav.ts",
      "utf8",
    );
    expect(nav).toContain('href: "/views/widgets"');
    expect(nav).toContain('label: "Widgets"');

    const manager = readFileSync(
      "src/dashboard/lib/components/WidgetsManager.tsx",
      "utf8",
    );
    expect(manager).toContain("<MasterDetailShell");
    expect(manager).toContain("Upload widget");
    expect(manager).toContain("Choose file");
    expect(manager).toContain("Commit SHA (optional)");
    expect(manager).toContain("No widgets yet");
    expect(manager).toContain("published per tenant");
    expect(manager).toContain("<Dialog open={open}");
    expect(manager).toContain("900_000");
  });
});
