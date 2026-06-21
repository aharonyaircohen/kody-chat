/** 
 * @fileoverview Structural regression tests for the managed goal create form.
 * @testFramework vitest
 * @domain goals
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/dashboard/lib/components/ManagedGoalsView.tsx",
  "utf8",
);

describe("ManagedGoalsView new goal form", () => {
  it("keeps creation to type, schedule, and finish line", () => {
    const dialog = source.slice(
      source.indexOf("function NewGoalDialog"),
      source.indexOf("function EditManagedGoalDialog"),
    );

    expect(dialog).toContain("<Label htmlFor=\"goal-type\">Type</Label>");
    expect(dialog).toContain("<Label htmlFor=\"goal-schedule\">Schedule</Label>");
    expect(dialog).toContain("<Label htmlFor=\"goal-outcome\">Finish line</Label>");
    expect(dialog).toContain("selectedGoalType.description");
    expect(dialog).toContain("selectedGoalType.bestFor");
    expect(dialog).toContain("selectedGoalType.systemSummary");
    expect(dialog).not.toContain("goal-create-mode");
    expect(dialog).not.toContain("New instance");
    expect(dialog).not.toContain("goal-id");
    expect(dialog).not.toContain("Goal preset");
    expect(dialog).not.toContain("Proof key");
    expect(dialog).not.toContain("Proof route");
    expect(dialog).not.toContain("Advanced");
  });

  it("keeps edit away from route and proof internals", () => {
    const dialog = source.slice(
      source.indexOf("function EditManagedGoalDialog"),
      source.indexOf("function GoalRow"),
    );

    expect(dialog).toContain(
      "<Label htmlFor=\"edit-goal-outcome\">Finish line</Label>",
    );
    expect(dialog).toContain(
      "<Label htmlFor=\"edit-goal-schedule\">Schedule</Label>",
    );
    expect(dialog).not.toContain("Proof key");
    expect(dialog).not.toContain("Proof route");
    expect(dialog).not.toContain("Advanced");
  });
});
