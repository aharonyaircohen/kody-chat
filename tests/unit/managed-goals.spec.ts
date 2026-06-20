/**
 * @fileoverview Unit tests for managed goal helpers.
 * @testFramework vitest
 * @domain goals
 */

import { describe, expect, it } from "vitest";

import { goalStatePath } from "../../src/dashboard/lib/goal-state";
import {
  isManagedGoalState,
  managedGoalPath,
} from "../../src/dashboard/lib/managed-goals";

describe("managedGoalPath", () => {
  it("points to live goal instances, not templates or flat goal files", () => {
    expect(managedGoalPath("simple-rollout")).toBe(
      ".kody/goals/instances/simple-rollout/state.json",
    );
  });
});

describe("goalStatePath", () => {
  it("points Tasks-page goals to live goal instances", () => {
    expect(goalStatePath("legacy-dashboard-goal")).toBe(
      ".kody/goals/instances/legacy-dashboard-goal/state.json",
    );
  });
});

describe("isManagedGoalState", () => {
  it("accepts inactive Store templates", () => {
    expect(
      isManagedGoalState({
        version: 1,
        kind: "template",
        templateId: "web-release",
        state: "inactive",
        type: "web-release",
        destination: {
          outcome: "Release is deployed.",
          evidence: ["productionDeployed"],
        },
        duties: ["vercel-production-deploy"],
        route: [],
        facts: {},
        blockers: [],
      }),
    ).toBe(true);
  });
});
