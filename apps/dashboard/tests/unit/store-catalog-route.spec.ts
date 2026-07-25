import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/kody/store-catalog/route.ts", "utf8");

describe("simple Store catalog", () => {
  it("lists only current Store asset kinds", () => {
    expect(source).toContain(
      '"agent" | "workflow" | "capability" | "loop" | "command" | "feature"',
    );
    expect(source).not.toContain('"implementation"');
    expect(source).not.toContain('"goal"');
    expect(source).not.toContain("managedGoal");
    expect(source).toContain("listStoreCatalogSlugs");
  });

  it("derives Agent and Capability uninstall blockers from active Workflows", () => {
    expect(source).toContain("workflowBlockers");
    expect(source).toContain("item.workflow.agent === agent");
  });

  it("lists lightweight Store entries without opening every asset", () => {
    expect(source).toContain("listStoreCatalogSlugs");
    expect(source).not.toContain("listStoreCapabilityFiles");
    expect(source).not.toContain("listStoreAgentFiles");
    expect(source).not.toContain("listStoreCommandFiles");
    expect(source).not.toContain("listCompanyStoreWorkflowDefinitionFiles");
    expect(source).not.toContain("listStoreLoops");
    expect(source).toContain(
      ".filter((slug) => active.workflow.has(slug))",
    );
  });
});
