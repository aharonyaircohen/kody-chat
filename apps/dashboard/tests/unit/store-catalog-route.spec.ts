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
    expect(source).toContain("listStoreLoops");
  });

  it("derives Agent and Capability uninstall blockers from active Workflows", () => {
    expect(source).toContain("workflowBlockers");
    expect(source).toContain("item.workflow.agent === agent");
  });
});
