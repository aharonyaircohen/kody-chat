import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardHomeSource = () =>
  readFileSync(
    join(
      process.cwd(),
      "src/dashboard/lib/components/DashboardHome.tsx",
    ),
    "utf8",
  );

describe("DashboardHome layout", () => {
  it("keeps the overview first and removes the redundant triage strip", () => {
    const source = dashboardHomeSource();
    const atAGlance = source.indexOf('title="At a glance"');
    const happeningNow = source.indexOf("<HappeningNow");
    const needsAttention = source.indexOf("Needs attention");

    expect(source).not.toContain("TriageStrip");
    expect(atAGlance).toBeGreaterThan(-1);
    expect(happeningNow).toBeGreaterThan(atAGlance);
    expect(needsAttention).toBeGreaterThan(happeningNow);
  });
});
