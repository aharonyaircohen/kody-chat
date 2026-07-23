import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Knowledge System page contract", () => {
  it("ships a repository-scoped page, API, navigation, and visual graph", () => {
    expect(existsSync("app/(chat-rail)/knowledge-system/page.tsx")).toBe(true);
    expect(existsSync("app/api/kody/knowledge-system/route.ts")).toBe(true);

    const routes = readFileSync("../../packages/base/src/routes.ts", "utf8");
    expect(routes).toContain('"/knowledge-system"');
    expect(routes).toContain("repoKnowledgeSystem");

    const nav = readFileSync(
      "src/dashboard/lib/components/settings-nav.ts",
      "utf8",
    );
    expect(nav).toContain('href: "/knowledge-system"');
    expect(nav).toContain('label: "Knowledge System"');

    const page = readFileSync(
      "src/dashboard/features/knowledge-system/components/KnowledgeSystemPage.tsx",
      "utf8",
    );
    expect(page).not.toContain("cytoscape");
    expect(page).not.toContain("ReactFlow");
    expect(page).toContain("<iframe");
    expect(page).toContain("bundle.htmlUrl");
    expect(page).toContain('data-testid="knowledge-graph-frame"');
    expect(page).toContain('sandbox="allow-scripts"');
    expect(page).not.toContain("parseGraphifyGraph");
    expect(page).toContain("Last updated");
    expect(page).toContain("Refresh graph");
    expect(page).toContain(
      "/api/kody/agency-loops/knowledge-system-refresh/run",
    );
    expect(page).not.toContain(
      "/api/kody/capabilities/knowledge-system-refresh/run",
    );
  });
});
