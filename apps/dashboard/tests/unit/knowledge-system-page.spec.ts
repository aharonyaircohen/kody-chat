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
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain("bundle.htmlUrl");
    expect(page).not.toContain("fetch(data.bundle.graphUrl");
    expect(page).toContain('"/api/kody/knowledge-system/query"');
    expect(page).toContain("parseKnowledgeGraph");
    expect(page).toContain("<KnowledgeExplorer");
    expect(page).toContain("domains={bundle.domains");
    expect(page).not.toContain("Refresh graph");
    expect(page).not.toContain(
      "/api/kody/agency-loops/knowledge-system-refresh/run",
    );
    expect(page).not.toContain(
      "/api/kody/capabilities/knowledge-system-refresh/run",
    );
    expect(page).toContain(
      "A graph will appear here after it is published for this repository.",
    );

    const explorer = readFileSync(
      "src/dashboard/features/knowledge-system/components/KnowledgeExplorer.tsx",
      "utf8",
    );
    expect(explorer).toContain("<PageShell");
    expect(explorer).not.toContain("MasterDetailShell");
    expect(explorer).toContain("KNOWLEDGE_DOMAINS");
    expect(explorer).toContain("Source evidence");
    expect(explorer).toContain("KnowledgeGraphCanvas");
    expect(explorer).toContain("All layers");
    expect(explorer).not.toContain("KnowledgeDomainOverview");
    expect(explorer).not.toContain("<ul");

    const canvas = readFileSync(
      "src/dashboard/features/knowledge-system/components/KnowledgeGraphCanvas.tsx",
      "utf8",
    );
    expect(canvas).toContain('from "vis-network/standalone"');
    expect(canvas).toContain('solver: "forceAtlas2Based"');
    expect(canvas).not.toContain("community");
    expect(canvas).not.toContain("stabilizationIterationsDone");
  });
});
