/**
 * Unit tests for collapseManagedGoalRecordsForList — in particular the
 * naming-convention grouping of scheduled-goal instance rows
 * (`<base>-YYYY-MM-DD[-N]`) that carry no `sourceTemplate` (e.g. the QA
 * postflight's daily `qa-smoke-<date>` goals).
 */
import { describe, expect, it } from "vitest";
import {
  collapseManagedGoalRecordsForList,
  managedGoalInstanceBaseId,
  type ManagedGoalRecord,
  type ManagedGoalState,
} from "../src/managed-goals";

function state(overrides: Record<string, unknown> = {}): ManagedGoalState {
  return {
    version: 1,
    state: "active",
    type: "general",
    destination: { outcome: "done", evidence: [] },
    capabilities: [],
    route: [],
    facts: {},
    blockers: [],
    ...overrides,
  } as unknown as ManagedGoalState;
}

function record(
  id: string,
  overrides: Record<string, unknown> = {},
): ManagedGoalRecord {
  return {
    id,
    path: `todos/${id}.json`,
    state: state(overrides),
    source: "local",
    recordType: "instance",
  };
}

describe("managedGoalInstanceBaseId", () => {
  it("extracts the base from dated instance ids", () => {
    expect(managedGoalInstanceBaseId("qa-smoke-2026-07-15")).toBe("qa-smoke");
    expect(managedGoalInstanceBaseId("qa-smoke-2026-07-12-2")).toBe("qa-smoke");
    expect(managedGoalInstanceBaseId("web-release-2026-06-26")).toBe(
      "web-release",
    );
  });

  it("returns empty for non-instance ids", () => {
    expect(managedGoalInstanceBaseId("web-release")).toBe("");
    expect(managedGoalInstanceBaseId("todo-list-1")).toBe("");
  });
});

describe("collapseManagedGoalRecordsForList", () => {
  it("groups sourceTemplate instances under one row (existing behavior)", () => {
    const collapsed = collapseManagedGoalRecordsForList([
      record("web-release", { sourceTemplate: "web-release" }),
      record("web-release-2026-07-05", { sourceTemplate: "web-release" }),
      record("web-release-2026-07-08", { sourceTemplate: "web-release" }),
    ]);
    expect(collapsed.map((g) => g.id)).toEqual(["web-release"]);
    expect(collapsed[0]!.state.instanceCount).toBe(2);
  });

  it("groups dated instances without sourceTemplate by naming when siblings exist", () => {
    const collapsed = collapseManagedGoalRecordsForList([
      record("qa-smoke-2026-07-11"),
      record("qa-smoke-2026-07-12"),
      record("qa-smoke-2026-07-12-2"),
      record("qa-smoke-2026-07-15"),
    ]);
    expect(collapsed.map((g) => g.id)).toEqual(["qa-smoke"]);
    expect(collapsed[0]!.state.instanceCount).toBe(4);
  });

  it("groups a single dated instance when its base exists as a goal", () => {
    const collapsed = collapseManagedGoalRecordsForList([
      record("nightly-report"),
      record("nightly-report-2026-07-15"),
    ]);
    expect(collapsed.map((g) => g.id)).toEqual(["nightly-report"]);
    expect(collapsed[0]!.state.instanceCount).toBe(1);
  });

  it("keeps a lone user-named goal ending in a date as a direct row", () => {
    const collapsed = collapseManagedGoalRecordsForList([
      record("launch-2026-08-01"),
      record("other-goal"),
    ]);
    expect(collapsed.map((g) => g.id).sort()).toEqual([
      "launch-2026-08-01",
      "other-goal",
    ]);
  });

  it("never groups template records by naming", () => {
    const collapsed = collapseManagedGoalRecordsForList([
      record("weekly-2026-07-13", { kind: "template" }),
      record("weekly-2026-07-14", { kind: "template" }),
    ]);
    expect(collapsed.map((g) => g.id).sort()).toEqual([
      "weekly-2026-07-13",
      "weekly-2026-07-14",
    ]);
  });
});
