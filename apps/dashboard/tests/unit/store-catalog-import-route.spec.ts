import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "app/api/kody/store-catalog/import/route.ts",
  "utf8",
);

describe("simple Store activation", () => {
  it("activates only current Store asset kinds", () => {
    expect(source).toContain(
      '"agent" | "capability" | "workflow" | "loop" | "command" | "feature"',
    );
    expect(source).not.toContain('"implementation"');
    expect(source).not.toContain('"goal"');
    expect(source).toContain("readStoreLoop");
  });

  it("activating a Workflow also activates its one Agent and Capabilities", () => {
    expect(source).toContain("workflowDefinition.capabilities");
    expect(source).toContain("workflowDefinition.agent");
    expect(source).toContain("activeWorkflowBlockers");
  });

  it("projects every Store config change into the Dashboard read model", () => {
    expect(source).toContain("saveProjectedEngineConfig");
    expect(source).toMatch(
      /await writeConfigPatch[\s\S]*await saveProjectedEngineConfig/,
    );
    expect(source).toContain("saveStoreWorkflowProjection");
    expect(source).not.toMatch(/if \(!changed\) \{\s*return/);
  });

  it("publishes executable Store definitions for Engine hydration", () => {
    expect(source).toContain("publishStoreExecutionDefinitions");
    expect(source).toContain("backendApi.definitions.publish");
    expect(source).toContain("backendApi.definitions.retire");
  });
});
