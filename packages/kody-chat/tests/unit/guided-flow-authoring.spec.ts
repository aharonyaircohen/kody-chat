import { describe, expect, it } from "vitest";
import {
  buildGuidedFlowDefinition,
  deriveGuidedFlowRendererData,
  migrateLegacyGuidedFlowDefinition,
  validateGuidedFlowDraft,
  type GuidedFlowDraft,
} from "@dashboard/lib/guided-flows/authoring";

const validDraft: GuidedFlowDraft = {
  title: "Review a release",
  completionRouteId: "workflows",
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

    expect(definition.steps[0].rendererData).toMatchObject({
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
    expect(definition.steps[0].rendererData).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ name: "clientId" }),
        expect.objectContaining({ name: "clientSecret" }),
      ]),
    });
  });

  it("builds a stable definition with generated ids and renderer data", () => {
    expect(buildGuidedFlowDefinition(validDraft, "review-release")).toEqual({
      id: "review-release",
      version: 1,
      title: "Review a release",
      completionRouteId: "workflows",
      steps: [
        {
          id: "step-1",
          title: "Confirm the release",
          explanation: "Check the release details before continuing.",
          rendererSlug: "approval-card",
          rendererData: {
            title: "Confirm the release",
            body: "Check the release details before continuing.",
            actions: [
              {
                id: "continue",
                label: "Finish",
                response: "continue",
                variant: "primary",
              },
            ],
          },
          allowedActions: ["continue"],
        },
      ],
    });
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
      allowedActions: ["submit"],
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

    expect(definition.steps[0].rendererData).toMatchObject({
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
      transitions: { submit: "step-2" },
      allowedActions: ["submit"],
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

  it("rejects unsupported renderer slugs", () => {
    expect(
      validateGuidedFlowDraft({
        ...validDraft,
        steps: [{ ...validDraft.steps[0], rendererSlug: "unknown" }],
      }),
    ).toEqual({ steps: "Choose a supported renderer for every step." });
  });
});
