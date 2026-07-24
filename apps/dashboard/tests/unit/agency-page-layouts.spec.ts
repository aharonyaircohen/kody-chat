import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = path.resolve(import.meta.dirname, "../..");

function source(relativePath: string) {
  return fs.readFileSync(path.join(dashboardRoot, relativePath), "utf8");
}

describe("agency page layouts", () => {
  it("keeps Loops in the shared master-detail layout", () => {
    const loops = source(
      "src/dashboard/features/agency/components/LoopsPage.tsx",
    );

    expect(loops).toContain("MasterDetailShell");
    expect(loops).toContain("selectedId");
    expect(loops).not.toContain('<main className="mx-auto');
  });

  it("keeps Overview in the shared standard-content layout", () => {
    const overview = source(
      "src/dashboard/features/agency/components/AgencyOverview.tsx",
    );

    expect(overview).toContain("PageShell");
    expect(overview).not.toContain('<main className="mx-auto');
  });
});
