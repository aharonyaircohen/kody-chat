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
    const graph = readFileSync(
      "src/dashboard/features/knowledge-system/components/KnowledgeGraph.tsx",
      "utf8",
    );
    const projections = readFileSync(
      "src/dashboard/features/knowledge-system/model/knowledge-graph-projections.ts",
      "utf8",
    );
    expect(page).not.toContain("cytoscape");
    expect(page).not.toContain("ReactFlow");
    expect(page).toContain("<KnowledgeGraph");
    expect(page).toContain("bundle.graphUrl");
    expect(page).not.toContain("<iframe");
    expect(page).not.toContain("parseGraphifyGraph");
    expect(page).toContain("Last updated");
    expect(page).toContain("Refresh graph");
    expect(page).toContain(
      "/api/kody/agency-loops/knowledge-system-refresh/run",
    );
    expect(page).not.toContain(
      "/api/kody/capabilities/knowledge-system-refresh/run",
    );
    expect(graph).toContain("Overall");
    expect(projections).toContain('purpose: "Purpose"');
    expect(projections).toContain('product: "Product"');
    expect(projections).toContain('work: "Work"');
    expect(projections).toContain('agency: "Agency"');
    expect(projections).toContain('evidence: "Evidence"');
    expect(graph).toContain("<KnowledgeGraphCanvas");
    expect(graph).not.toContain("react-force-graph");
    expect(graph).toContain("getKnowledgeNodeRelations");

    const canvas = readFileSync(
      "src/dashboard/features/knowledge-system/components/KnowledgeGraphCanvas.tsx",
      "utf8",
    );
    expect(canvas).toContain("import cytoscape");
    expect(canvas).toContain('import fcose from "cytoscape-fcose"');
    expect(canvas).toContain("cytoscape.use(fcose)");
    expect(canvas).toContain('shape: "ellipse"');
    expect(canvas).toContain('label: ""');
    expect(canvas).toContain('label: "data(displayLabel)"');
    expect(canvas).toContain('"text-wrap": "wrap"');
    expect(canvas).toContain('selector: "node.dimmed"');
    expect(canvas).toContain("labelZoomThreshold");
    expect(canvas).toContain("prefers-reduced-motion: reduce");
    expect(canvas).toContain("animate: shouldAnimate");
    expect(canvas).toContain('name: "fcose"');
    expect(canvas).toContain('quality: "draft"');
    expect(canvas).toContain("randomize: true");
    expect(canvas).toContain("animationDuration: 900");
    expect(canvas).not.toContain("startAmbientMotion");
    expect(canvas).toContain('"layoutstop"');
    expect(canvas).toContain('"min-zoomed-font-size"');
    expect(canvas).toContain("tap");
  });
});
