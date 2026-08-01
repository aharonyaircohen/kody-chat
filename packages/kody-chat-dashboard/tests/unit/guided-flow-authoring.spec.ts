import { describe, expect, it } from "vitest";
import {
  buildGuidedFlowDefinition,
  deriveGuidedFlowRendererData,
  migrateLegacyGuidedFlowDefinition,
  validateGuidedFlowDraft,
  type GuidedFlowDraft,
} from "../../src/dashboard/lib/guided-flows/authoring";
import {
  isNestedGuidedFlowStep,
  type GuidedFlowDefinition,
  type GuidedFlowViewStepDefinition,
} from "../../src/dashboard/lib/guided-flows/controller";

function viewStep(
  definition: GuidedFlowDefinition,
  index: number,
): GuidedFlowViewStepDefinition {
  const step = definition.steps[index];
  if (!step || isNestedGuidedFlowStep(step)) {
    throw new Error(`Expected view step ${index + 1}`);
  }
  return step;
}

const validDraft: GuidedFlowDraft = {
  title: "Review a release",
  completionRouteId: "workflows",
  controls: ["back"],
  steps: [
    {
      title: "Confirm the release",
      explanation: "Check the release details before continuing.",
      rendererSlug: "approval-card",
    },
  ],
};

describe("guided flow authoring", () => {
  it("generates a simple sign-in form from a plain-language goal", () => {
    expect(
      deriveGuidedFlowRendererData(
        "guided-form",
        "Ask for the client sign-in details",
      ),
    ).toMatchObject({
      fields: [
        { name: "clientId", label: "Client ID" },
        { name: "clientSecret", label: "Client secret", inputType: "password" },
        { name: "issuer", label: "Issuer" },
      ],
    });
  });

  it("generates visible choices for a selection goal", () => {
    expect(
      deriveGuidedFlowRendererData("selection-list", "Select course"),
    ).toMatchObject({
      items: [
        { id: "option-1", label: "Course 1" },
        { id: "option-2", label: "Course 2" },
        { id: "option-3", label: "Course 3" },
      ],
    });
  });

  it("generates approval actions named in the goal", () => {
    const definition = buildGuidedFlowDefinition({
      title: "Review request",
      steps: [
        {
          title: "Review request",
          explanation: "Ask user for confirm, decline, edit, redo",
          rendererSlug: "approval-card",
        },
      ],
    });

    expect(viewStep(definition, 0).rendererData).toMatchObject({
      actions: [
        { id: "confirm", label: "Confirm" },
        { id: "decline", label: "Decline" },
        { id: "edit", label: "Edit" },
        { id: "redo", label: "Redo" },
      ],
    });
  });

  it("stores generated renderer data in the saved definition", () => {
    const definition = buildGuidedFlowDefinition({
      ...validDraft,
      steps: [
        {
          title: "Configure sign-in",
          explanation: "Ask for the client sign-in details",
          rendererSlug: "guided-form",
        },
      ],
    });
    expect(viewStep(definition, 0).rendererData).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "clientId" }),
        expect.objectContaining({ name: "clientSecret" }),
      ]),
    });
  });

  it("preserves the page owned by an authored step", () => {
    const definition = buildGuidedFlowDefinition({
      ...validDraft,
      steps: [
        {
          title: "Configure secrets",
          explanation: "Add the required secret on its owning page.",
          routeId: "secrets",
          rendererSlug: "approval-card",
        },
      ],
    });

    expect(definition.steps[0]).toMatchObject({ routeId: "secrets" });
  });

  it("builds a stable definition with generated ids and renderer data", () => {
    expect(buildGuidedFlowDefinition(validDraft, "review-release")).toEqual({
      id: "review-release",
      version: 1,
      title: "Review a release",
      completionRouteId: "workflows",
      controls: ["back"],
      steps: [
        {
          id: "step-1",
          title: "Confirm the release",
          explanation: "Check the release details before continuing.",
          rendererSlug: "approval-card",
          rendererData: {
            title: "Confirm the release",
            actions: [
              {
                id: "continue",
                label: "Finish",
                response: "continue",
                variant: "primary",
              },
            ],
          },
          actions: [{ id: "continue", target: { type: "complete" } }],
        },
      ],
    });
  });

  it("omits controls when the author did not enable any", () => {
    const definition = buildGuidedFlowDefinition({
      ...validDraft,
      controls: [],
    });

    expect(definition).not.toHaveProperty("controls");
  });

  it("rejects duplicate controls", () => {
    expect(
      validateGuidedFlowDraft({
        ...validDraft,
        controls: ["back", "back"],
      }),
    ).toEqual({ controls: "Choose each control only once." });
  });

  it("uses the multi-select renderer's submit action for the final step", () => {
    const definition = buildGuidedFlowDefinition({
      title: "Choose items",
      steps: [
        {
          title: "Choose items",
          explanation: "Select one or more items.",
          rendererSlug: "multi-select-list",
        },
      ],
    });

    expect(definition.steps[0]).toMatchObject({
      rendererSlug: "multi-select-list",
      actions: [{ id: "submit", target: { type: "complete" } }],
    });
  });

  it("preserves authored multi-select options", () => {
    const definition = buildGuidedFlowDefinition({
      title: "Choose environments",
      steps: [
        {
          title: "Choose environments",
          explanation: "Select environments.",
          rendererSlug: "multi-select-list",
          rendererData: {
            items: [
              { id: "staging", label: "Staging" },
              { id: "production", label: "Production" },
            ],
          },
        },
      ],
    });

    expect(viewStep(definition, 0).rendererData).toMatchObject({
      items: [
        { id: "staging", label: "Staging" },
        { id: "production", label: "Production" },
      ],
    });
  });

  it("migrates legacy multi-select actions at the persistence boundary", () => {
    const definition = migrateLegacyGuidedFlowDefinition({
      id: "choose-items",
      version: 1,
      title: "Choose items",
      steps: [
        {
          id: "step-1",
          title: "Choose items",
          explanation: "Select items.",
          rendererSlug: "multi-select-list",
          transitions: { continue: "step-2" },
          allowedActions: ["continue"],
        },
        {
          id: "step-2",
          title: "Finish",
          explanation: "Finish.",
          rendererSlug: "approval-card",
        },
      ],
    });

    expect(definition.steps[0]).toMatchObject({
      actions: [{ id: "submit", target: { type: "step", stepId: "step-2" } }],
    });
  });

  it("rejects empty titles and flows without steps", () => {
    expect(validateGuidedFlowDraft({ ...validDraft, title: " " })).toEqual({
      title: "Enter a flow name.",
    });
    expect(validateGuidedFlowDraft({ ...validDraft, steps: [] })).toEqual({
      steps: "Add at least one step.",
    });
  });

  it("accepts custom renderer slugs and rejects malformed slugs", () => {
    expect(
      validateGuidedFlowDraft({
        ...validDraft,
        steps: [
          {
            title: "Custom",
            explanation: "Custom.",
            rendererSlug: "my-custom-renderer",
          },
        ],
      }),
    ).toEqual({});
    expect(
      validateGuidedFlowDraft({
        ...validDraft,
        steps: [
          {
            title: "Unknown",
            explanation: "Unknown.",
            rendererSlug: "not a valid slug",
          },
        ],
      }),
    ).toEqual({
      steps: "Choose a valid renderer or nested flow for every step.",
    });
  });
});
