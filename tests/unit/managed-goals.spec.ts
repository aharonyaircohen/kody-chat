/**
 * @fileoverview Unit tests for managed goal helpers.
 * @testFramework vitest
 * @domain goals
 */

import { describe, expect, it } from "vitest";

import { goalStatePath } from "../../src/dashboard/lib/goal-state";
import {
  collapseManagedGoalRecordsForList,
  isManagedGoalState,
  managedGoalPath,
  type ManagedGoalRecord,
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

describe("collapseManagedGoalRecordsForList", () => {
  function record(id: string, updatedAt: string): ManagedGoalRecord {
    return {
      id,
      path: `.kody/goals/instances/${id}/state.json`,
      source: "local",
      recordType: "instance",
      state: {
        version: 1,
        kind: "instance",
        templateId: "five-minute-goal-smoke",
        sourceTemplate: "five-minute-goal-smoke",
        state: "active",
        type: "monitor",
        destination: {
          outcome: "Verify recurring scheduling.",
          evidence: ["companyGraphRefreshed"],
        },
        duties: ["company-graph"],
        route: [],
        facts: {},
        blockers: [],
        updatedAt,
      },
    };
  }

  it("groups generated scheduled instances under their template id", () => {
    const goals = collapseManagedGoalRecordsForList([
      record("five-minute-goal-smoke-b5940142", "2026-06-21T11:50:54Z"),
      record("five-minute-goal-smoke-b5940143", "2026-06-21T11:58:23Z"),
    ]);

    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      id: "five-minute-goal-smoke",
      recordType: "template",
      updatedAt: "2026-06-21T11:58:23Z",
      state: {
        sourceTemplate: "five-minute-goal-smoke",
        latestInstanceId: "five-minute-goal-smoke-b5940143",
        instanceCount: 2,
        instanceIds: [
          "five-minute-goal-smoke-b5940142",
          "five-minute-goal-smoke-b5940143",
        ],
      },
    });
  });
});
