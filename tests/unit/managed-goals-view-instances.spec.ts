/**
 * @fileoverview Structural regression tests for managed goal instance history.
 * @testFramework vitest
 * @domain goals
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/lib/components/ManagedGoalsView.tsx",
  "utf8",
);

describe("ManagedGoalsView instance history", () => {
  it("renders grouped goal instances as read-only detail history", () => {
    const section = source.slice(
      source.indexOf("function GoalInstancesSection"),
      source.indexOf("function GoalDetail"),
    );

    expect(source).toContain("function GoalInstancesSection");
    expect(source).toContain('title="Instances"');
    expect(source).toContain("goal.state.latestInstanceId");
    expect(source).toContain("completedInstanceEvidence");
    expect(source).toContain("<GoalInstancesSection goal={goal} />");
    expect(section).not.toContain("<Button");
    expect(section).not.toContain("onEdit");
    expect(section).not.toContain("onDelete");
  });
});
