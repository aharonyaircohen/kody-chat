import { getBuiltinViewRendererDefinition } from "@dashboard/lib/view-renderers/builtin";
import type {
  GuidedFlowDefinition,
  GuidedFlowStepDefinition,
} from "./controller";

export interface GuidedFlowDraftStep {
  title: string;
  explanation: string;
  rendererSlug: string;
}

export interface GuidedFlowDraft {
  title: string;
  completionRouteId?: string;
  steps: GuidedFlowDraftStep[];
}

export type GuidedFlowDraftErrors = Partial<Record<"title" | "steps", string>>;

const SUPPORTED_RENDERERS = [
  "approval-card",
  "guided-form",
  "selection-list",
  "multi-select-list",
] as const;

export function listAuthoringRendererSlugs(): readonly string[] {
  return SUPPORTED_RENDERERS.filter((slug) =>
    Boolean(getBuiltinViewRendererDefinition(slug)),
  );
}

export function validateGuidedFlowDraft(
  draft: GuidedFlowDraft,
): GuidedFlowDraftErrors {
  if (!draft.title.trim()) return { title: "Enter a flow name." };
  if (draft.steps.length === 0) return { steps: "Add at least one step." };
  if (
    draft.steps.some((step) => !step.title.trim() || !step.explanation.trim())
  ) {
    return { steps: "Complete every step and choose a supported renderer." };
  }
  if (
    !draft.steps.every((step) =>
      listAuthoringRendererSlugs().includes(step.rendererSlug),
    )
  ) {
    return { steps: "Choose a supported renderer for every step." };
  }
  return {};
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function rendererDataFor(
  step: GuidedFlowDraftStep,
  nextStepId?: string,
): Pick<
  GuidedFlowStepDefinition,
  "rendererData" | "transitions" | "allowedActions"
> {
  if (step.rendererSlug === "approval-card") {
    return {
      rendererData: {
        title: step.title,
        body: step.explanation,
        actions: [
          {
            id: "continue",
            label: nextStepId ? "Continue" : "Finish",
            response: "continue",
            variant: "primary",
          },
        ],
      },
      ...(nextStepId ? { transitions: { continue: nextStepId } } : {}),
      allowedActions: ["continue"],
    };
  }

  if (step.rendererSlug === "guided-form") {
    return {
      rendererData: {
        title: step.title,
        body: step.explanation,
        fields: [{ name: "response", label: "Your response", value: "" }],
        submitLabel: nextStepId ? "Continue" : "Finish",
      },
      ...(nextStepId ? { transitions: { submit: nextStepId } } : {}),
      allowedActions: ["submit"],
    };
  }

  return {
    rendererData: {
      title: step.title,
      body: step.explanation,
      items: [
        {
          id: "continue",
          label: nextStepId ? "Continue" : "Finish",
          response: "continue",
          variant: "primary",
        },
      ],
    },
    ...(nextStepId ? { transitions: { continue: nextStepId } } : {}),
    allowedActions: ["continue"],
  };
}

export function buildGuidedFlowDefinition(
  draft: GuidedFlowDraft,
  requestedId?: string,
): GuidedFlowDefinition {
  const errors = validateGuidedFlowDraft(draft);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0]);
  }

  const id = slugify(requestedId || draft.title);
  if (!id) throw new Error("Flow name must contain a letter or number.");
  const steps = draft.steps.map((step, index) => {
    const nextStepId =
      index < draft.steps.length - 1 ? `step-${index + 2}` : undefined;
    return {
      id: `step-${index + 1}`,
      title: step.title.trim(),
      explanation: step.explanation.trim(),
      rendererSlug: step.rendererSlug,
      ...rendererDataFor(step, nextStepId),
    };
  });

  return {
    id,
    version: 1,
    title: draft.title.trim(),
    ...(draft.completionRouteId?.trim()
      ? { completionRouteId: draft.completionRouteId.trim() }
      : {}),
    steps,
  };
}
