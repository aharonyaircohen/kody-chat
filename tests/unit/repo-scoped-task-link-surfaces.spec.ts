import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = (file: string) =>
  readFileSync(
    join(process.cwd(), "src/dashboard/lib/components", file),
    "utf8",
  );

describe("repo-scoped task link surfaces", () => {
  it("uses repo-scoped history paths in KodyDashboard", () => {
    const source = componentSource("KodyDashboard.tsx");
    expect(source).toContain("repoScopedHref");
    expect(source).toContain("repoPathForNavMatching");
    expect(source).toContain("pushKodyPath");
    expect(source).not.toContain('window.history.pushState(null, "", "/")');
    expect(source).not.toContain('window.history.pushState(null, "", `/${');
  });

  it("uses repo-scoped hrefs for task links across task-heavy surfaces", () => {
    for (const file of [
      "TaskList.tsx",
      "TaskDetail.tsx",
      "DashboardHome.tsx",
      "ActivityPage.tsx",
      "HappeningNow.tsx",
      "InboxList.tsx",
      "GoalControl.tsx",
    ]) {
      const source = componentSource(file);
      expect(source, file).toContain("repoScopedHref");
      expect(source, file).not.toContain("href={`/${");
      expect(source, file).not.toContain("router.push(`/${");
    }
  });
});
