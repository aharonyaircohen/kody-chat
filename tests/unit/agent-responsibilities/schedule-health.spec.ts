/**
 * Unit tests for agentResponsibility schedule-health interpretation. Pure function, no I/O.
 */
import { describe, it, expect } from "vitest";
import {
  agentResponsibilityScheduleHealth,
  summarizeAgentResponsibilityHealth,
  type AgentResponsibilityHealthInput,
} from "@dashboard/lib/agent-responsibilities/schedule-health";

const NOW = Date.parse("2026-05-22T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

function agentResponsibility(over: Partial<AgentResponsibilityHealthInput>): AgentResponsibilityHealthInput {
  return {
    schedule: "1h",
    lastTickAt: ago(30 * MIN),
    nextEligibleAt: ahead(30 * MIN),
    disabled: false,
    updatedAt: ago(10 * HOUR),
    ...over,
  };
}

describe("agentResponsibilityScheduleHealth", () => {
  it("reports disabled and manual as descriptive (not problems)", () => {
    expect(agentResponsibilityScheduleHealth(agentResponsibility({ disabled: true }), NOW)).toBe("disabled");
    expect(agentResponsibilityScheduleHealth(agentResponsibility({ schedule: "manual" }), NOW)).toBe(
      "manual",
    );
  });

  it("reports scheduled agentResponsibilities with no runner as skipped", () => {
    expect(agentResponsibilityScheduleHealth(agentResponsibility({ runner: null }), NOW)).toBe("skipped");
  });

  it("is ok when the next-eligible time is still in the future", () => {
    expect(
      agentResponsibilityScheduleHealth(agentResponsibility({ nextEligibleAt: ahead(20 * MIN) }), NOW),
    ).toBe("ok");
  });

  it("is ok within the cron grace window after next-eligible passes", () => {
    expect(
      agentResponsibilityScheduleHealth(agentResponsibility({ nextEligibleAt: ago(10 * MIN) }), NOW),
    ).toBe("ok");
  });

  it("flags overdue once next-eligible passed beyond the grace window", () => {
    expect(
      agentResponsibilityScheduleHealth(agentResponsibility({ nextEligibleAt: ago(45 * MIN) }), NOW),
    ).toBe("overdue");
  });

  it("flags never-run for an old scheduled agentResponsibility with no state file", () => {
    expect(
      agentResponsibilityScheduleHealth(
        agentResponsibility({
          lastTickAt: null,
          nextEligibleAt: null,
          updatedAt: ago(5 * HOUR),
        }),
        NOW,
      ),
    ).toBe("never");
  });

  it("does not flag a freshly-created agentResponsibility that hasn't ticked yet", () => {
    expect(
      agentResponsibilityScheduleHealth(
        agentResponsibility({
          lastTickAt: null,
          nextEligibleAt: null,
          updatedAt: ago(2 * MIN),
        }),
        NOW,
      ),
    ).toBe("ok");
  });

  it("uses the 15m cron cadence when schedule is null (every wake)", () => {
    // 40m old, never ticked, no explicit cadence → past 15m+grace → never.
    expect(
      agentResponsibilityScheduleHealth(
        agentResponsibility({
          schedule: null,
          lastTickAt: null,
          nextEligibleAt: null,
          updatedAt: ago(40 * MIN),
        }),
        NOW,
      ),
    ).toBe("never");
  });
});

describe("summarizeAgentResponsibilityHealth", () => {
  it("counts overdue and never-run across a list", () => {
    const list = [
      agentResponsibility({}), // ok
      agentResponsibility({ nextEligibleAt: ago(60 * MIN) }), // overdue
      agentResponsibility({ nextEligibleAt: ago(90 * MIN) }), // overdue
      agentResponsibility({
        lastTickAt: null,
        nextEligibleAt: null,
        updatedAt: ago(8 * HOUR),
      }), // never
      agentResponsibility({ disabled: true }), // disabled (ignored)
      agentResponsibility({ runner: null }), // skipped
    ];
    expect(summarizeAgentResponsibilityHealth(list, NOW)).toEqual({
      overdue: 2,
      never: 1,
      skipped: 1,
    });
  });
});
