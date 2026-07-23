import { describe, expect, it } from "vitest";
import { planAgencyV2Migration } from "../src/migration/agency-v2";

describe("Agency V2 migration planner", () => {
  it("moves ownership to Goals/Loops and routes to Workflows", () => {
    const plan = planAgencyV2Migration({
      tenantId: "acme/widgets",
      intents: [
        {
          id: "quality",
          for: "Keep delivery reliable",
          principles: ["verify changes"],
          controls: {
            automation: {
              maxConcurrentGoals: 2,
              maxDailyActions: 8,
              requiresHumanFor: ["production"],
            },
          },
        },
      ],
      operations: [
        {
          id: "delivery",
          name: "Delivery",
          responsibility: "Ship safely",
          intentIds: ["quality"],
          goals: ["ship-release"],
          loops: ["health-watch"],
        },
      ],
      managedWork: [
        {
          id: "ship-release",
          model: "goal",
          destination: { outcome: "Release ships", evidence: ["deployed"] },
          route: [
            { stage: "plan", capability: "plan" },
            { stage: "release", capability: "deploy" },
          ],
        },
        {
          id: "health-watch",
          model: "loop",
          destination: {
            outcome: "Service stays healthy",
            evidence: ["report"],
          },
          route: [],
          schedule: "1h",
          loopTarget: { type: "workflow", id: "health-check" },
        },
      ],
      workflows: [
        {
          id: "health-check",
          capabilities: ["observe", "report"],
        },
      ],
    });

    expect(plan.issues).toEqual([]);
    expect(plan.definitions.operations[0]).toEqual({
      id: "delivery",
      name: "Delivery",
      responsibility: "Ship safely",
      doesNotOwn: [],
      intentIds: ["quality"],
    });
    expect(plan.definitions.goals[0]).toMatchObject({
      id: "ship-release",
      operationId: "delivery",
      executionRef: { kind: "workflow", id: "ship-release-workflow" },
    });
    expect(plan.definitions.workflows[0]?.steps).toHaveLength(2);
    expect(plan.definitions.workflows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "health-check" })]),
    );
    expect(plan.definitions.loops[0]).toMatchObject({
      id: "health-watch",
      operationId: "delivery",
      trigger: { type: "schedule", every: "1h" },
    });
    expect(plan.states.intents[0]).toMatchObject({
      definitionId: "quality",
      lifecycle: "active",
    });
    expect(plan.states.operations[0]).toMatchObject({
      definitionId: "delivery",
      lifecycle: "draft",
    });
  });

  it("reports ownership gaps and duplicates instead of guessing", () => {
    const plan = planAgencyV2Migration({
      tenantId: "acme/widgets",
      intents: [],
      operations: [
        {
          id: "one",
          name: "One",
          responsibility: "One",
          intentIds: [],
          goals: ["g"],
          loops: [],
        },
        {
          id: "two",
          name: "Two",
          responsibility: "Two",
          intentIds: [],
          goals: ["g"],
          loops: [],
        },
      ],
      managedWork: [
        {
          id: "g",
          model: "goal",
          destination: { outcome: "Done", evidence: [] },
          route: [{ stage: "run", capability: "fix" }],
        },
      ],
      workflows: [],
    });

    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/duplicate Operation owners/),
        expect.stringMatching(/has no Operation owner/),
      ]),
    );
    expect(plan.definitions.goals).toEqual([]);
  });

  it("blocks conditional legacy workflows instead of changing their behavior", () => {
    const plan = planAgencyV2Migration({
      tenantId: "acme/widgets",
      intents: [],
      operations: [],
      managedWork: [],
      workflows: [
        {
          id: "conditional-release",
          capabilities: ["inspect", "deploy", "report"],
          steps: [
            {
              id: "inspect",
              capability: "inspect",
              next: [
                { to: "deploy", when: { approved: true } },
                { to: "report", default: true },
              ],
            },
            { id: "deploy", capability: "deploy" },
            { id: "report", capability: "report" },
          ],
        },
      ],
    });

    expect(plan.issues).toContain(
      'Workflow "conditional-release" contains conditional transitions and requires manual V2 redesign',
    );
    expect(plan.definitions.workflows).toEqual([]);
  });
});
