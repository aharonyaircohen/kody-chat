import { describe, expect, it } from "vitest";

import {
  buildGuidedFlowFromRequestBlueprint,
  buildRequestBlueprintModelGuide,
  type RequestBlueprintDefinition,
} from "../../src/dashboard/lib/request-blueprints";

const definition: RequestBlueprintDefinition = {
  id: "create-blueprint",
  version: 1,
  title: "Create Blueprint",
  introduction: {
    title: "Define the reusable result",
    explanation: "Answer once so Kody and the Guided Flow use the same brief.",
  },
  modelPurpose: "Create a reusable Store Blueprint.",
  questions: [
    {
      id: "desired-outcome",
      name: "desiredOutcome",
      title: "What should the Blueprint achieve?",
      explanation: "Describe the reusable result.",
      followUps: [
        {
          id: "activation",
          name: "activation",
          title: "When should the installed Agency act?",
          explanation: "Describe the trigger.",
        },
      ],
    },
    {
      id: "success-criteria",
      name: "successCriteria",
      title: "What proves it works?",
      explanation: "Describe end-to-end proof.",
    },
  ],
  onComplete: { action: "agency-request.submit" },
};

describe("Request Blueprint", () => {
  it("generates one Guided Flow with follow-up questions in order", () => {
    const flow = buildGuidedFlowFromRequestBlueprint(definition);

    expect(flow).toMatchObject({
      id: "create-blueprint",
      version: 1,
      title: "Create Blueprint",
      onComplete: { action: "agency-request.submit" },
    });
    expect(flow.steps.map(({ id }) => id)).toEqual([
      "introduction",
      "desired-outcome",
      "activation",
      "success-criteria",
    ]);
    expect(flow.steps[1]?.actions[0]?.target).toEqual({
      type: "step",
      stepId: "activation",
    });
    expect(flow.steps.at(-1)?.actions[0]?.target).toEqual({
      type: "complete",
    });
  });

  it("generates Kody guidance from the same questions", () => {
    const guide = buildRequestBlueprintModelGuide(definition);

    expect(guide).toContain("Create a reusable Store Blueprint.");
    expect(guide).toContain("desiredOutcome: What should the Blueprint achieve?");
    expect(guide).toContain("activation: When should the installed Agency act?");
    expect(guide).toContain("successCriteria: What proves it works?");
    expect(guide).toMatch(/ask only for a missing user decision/i);
  });

  it("rejects duplicate question ids or answer names", () => {
    expect(() =>
      buildGuidedFlowFromRequestBlueprint({
        ...definition,
        questions: [
          definition.questions[0]!,
          { ...definition.questions[1]!, id: "desired-outcome" },
        ],
      }),
    ).toThrow(/duplicate question id/i);

    expect(() =>
      buildRequestBlueprintModelGuide({
        ...definition,
        questions: [
          definition.questions[0]!,
          { ...definition.questions[1]!, name: "activation" },
        ],
      }),
    ).toThrow(/duplicate answer name/i);
  });
});
