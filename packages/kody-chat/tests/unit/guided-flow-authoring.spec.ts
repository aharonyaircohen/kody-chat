import { describe, expect, it } from "vitest";
import {
  buildGuidedFlowDefinition,
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
