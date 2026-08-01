import { getBuiltinViewRendererDefinition } from "../view-renderers/builtin";
import { VIEW_RENDERER_SLUG_RE } from "../view-renderers/definition";
import {
  isNestedGuidedFlowStep,
  type GuidedFlowDefinition,
  type GuidedFlowViewStepDefinition,
} from "./controller";

export interface GuidedFlowDraftViewStep {
  type?: "view";
  title: string;
  explanation: string;
  rendererSlug: string;
  rendererVersion?: number;
  rendererData?: Record<string, unknown>;
}

export interface GuidedFlowDraftNestedStep {
  type: "flow";
  title: string;
  explanation: string;
  flowId: string;
  flowVersion: number;
}

export type GuidedFlowDraftStep =
  GuidedFlowDraftViewStep | GuidedFlowDraftNestedStep;

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
    return { steps: "Complete every step." };
  }
  if (
    !draft.steps.every((step) => {
      if (step.type === "flow") {
        return (
          Boolean(step.flowId.trim()) &&
          Number.isInteger(step.flowVersion) &&
          step.flowVersion > 0
        );
      }
      return (
        VIEW_RENDERER_SLUG_RE.test(step.rendererSlug) &&
        (step.rendererVersion === undefined ||
          (Number.isInteger(step.rendererVersion) && step.rendererVersion > 0))
      );
    })
  ) {
    return { steps: "Choose a valid renderer or nested flow for every step." };
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

function approvalActionsForGoal(
  goal: string,
  nextStepId?: string,
): {
  actions: Array<Record<string, string>>;
  transitions?: Record<string, string>;
} {
  const normalizedGoal = goal.toLowerCase();
  const candidates = [
    { id: "confirm", label: "Confirm", pattern: /confirm|approve/ },
    { id: "decline", label: "Decline", pattern: /decline|reject|cancel/ },
    { id: "edit", label: "Edit", pattern: /edit|change/ },
    { id: "redo", label: "Redo", pattern: /redo|retry/ },
  ];
  const requested = candidates.filter(({ pattern }) =>
    pattern.test(normalizedGoal),
  );
  const actions = (
    requested.length > 0
      ? requested
      : [
          {
            id: "continue",
            label: nextStepId ? "Continue" : "Finish",
            pattern: /.*/,
          },
        ]
  ).map(({ id, label }, index) => ({
    id,
    label,
    response: id,
    variant: index === 0 ? "primary" : "secondary",
  }));
  return {
    actions,
    ...(nextStepId
      ? {
          transitions: Object.fromEntries(
            actions.map((action) => [action.id, nextStepId]),
          ),
        }
      : {}),
  };
}

export function deriveGuidedFlowRendererData(
  rendererSlug: string,
  goal: string,
): Record<string, unknown> {
  const normalizedGoal = goal.toLowerCase();
  if (
    rendererSlug === "guided-form" &&
    /(client|oauth|sign.?in|credentials?)/.test(normalizedGoal)
  ) {
    return {
      fields: [
        { name: "clientId", label: "Client ID", value: "" },
        {
          name: "clientSecret",
          label: "Client secret",
          value: "",
          inputType: "password",
        },
        { name: "issuer", label: "Issuer", value: "" },
      ],
    };
  }
  if (rendererSlug === "guided-form") {
    return {
      fields: [{ name: "response", label: "Your response", value: "" }],
    };
  }
  if (
    rendererSlug === "selection-list" ||
    rendererSlug === "multi-select-list"
  ) {
    const topic = goal
      .trim()
      .replace(/^(please\s+)?(select|choose|pick)\s+/i, "")
      .replace(/\s+(from|among|between)\s+.*$/i, "")
      .trim();
    const label = topic
      ? topic.charAt(0).toUpperCase() + topic.slice(1)
      : "Option";
    return {
      items: [1, 2, 3].map((number) => ({
        id: `option-${number}`,
        label: `${label} ${number}`,
      })),
    };
  }
  return {};
}

export function migrateLegacyGuidedFlowDefinition(
  definition: GuidedFlowDefinition,
): GuidedFlowDefinition {
  return {
    ...definition,
    steps: definition.steps.map((step) => {
      if (isNestedGuidedFlowStep(step)) return step;
      if (
        step.rendererSlug !== "multi-select-list" ||
        !step.allowedActions?.includes("continue")
      ) {
        return step;
      }

      const transitions = step.transitions
        ? Object.fromEntries(
            Object.entries(step.transitions).map(([actionId, nextStepId]) => [
              actionId === "continue" ? "submit" : actionId,
              nextStepId,
            ]),
          )
        : undefined;

      return {
        ...step,
        ...(transitions ? { transitions } : {}),
        allowedActions: step.allowedActions.map((actionId) =>
          actionId === "continue" ? "submit" : actionId,
        ),
      };
    }),
  };
}

function rendererDataFor(
  step: GuidedFlowDraftViewStep,
  nextStepId?: string,
): Pick<
  GuidedFlowViewStepDefinition,
  "rendererData" | "transitions" | "allowedActions"
> {
  const body = step.explanation.trim();
  const generatedData =
    step.rendererData ?? deriveGuidedFlowRendererData(step.rendererSlug, body);
  if (step.rendererSlug === "approval-card") {
    const approval = approvalActionsForGoal(body, nextStepId);
    return {
      rendererData: {
        ...generatedData,
        title: step.title,
        body,
        actions: approval.actions,
      },
      ...(approval.transitions ? { transitions: approval.transitions } : {}),
      allowedActions: approval.actions.map((action) => action.id),
    };
  }

  if (step.rendererSlug === "guided-form") {
    return {
      rendererData: {
        ...generatedData,
        title: step.title,
        body,
        submitLabel: nextStepId ? "Continue" : "Finish",
      },
      ...(nextStepId ? { transitions: { submit: nextStepId } } : {}),
      allowedActions: ["submit"],
    };
  }

  if (step.rendererSlug === "multi-select-list") {
    const items =
      Array.isArray(generatedData.items) && generatedData.items.length > 0
        ? generatedData.items
        : [{ id: "option-1", label: "Option 1" }];
    return {
      rendererData: {
        ...generatedData,
        title: step.title,
        body,
        items,
      },
      ...(nextStepId ? { transitions: { submit: nextStepId } } : {}),
      allowedActions: ["submit"],
    };
  }

  const items =
    Array.isArray(generatedData.items) && generatedData.items.length > 0
      ? generatedData.items
      : [{ id: "continue", label: "Finish", response: "continue" }];

  return {
    rendererData: {
      ...generatedData,
      title: step.title,
      body,
      items,
    },
    ...(nextStepId ? { transitions: { continue: nextStepId } } : {}),
    allowedActions: ["continue"],
  };
}

export function buildGuidedFlowDefinition(
  draft: GuidedFlowDraft,
  requestedId?: string,
  version = 1,
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
    if (step.type === "flow") {
      return {
        id: `step-${index + 1}`,
        type: "flow" as const,
        title: step.title.trim(),
        explanation: step.explanation.trim(),
        flowId: step.flowId.trim(),
        flowVersion: step.flowVersion,
        ...(nextStepId ? { transitions: { complete: nextStepId } } : {}),
      };
    }
    return {
      id: `step-${index + 1}`,
      title: step.title.trim(),
      explanation: step.explanation.trim(),
      rendererSlug: step.rendererSlug,
      ...(step.rendererVersion
        ? { rendererVersion: step.rendererVersion }
        : {}),
      ...rendererDataFor(step, nextStepId),
    };
  });

  return {
    id,
    version,
    title: draft.title.trim(),
    ...(draft.completionRouteId?.trim()
      ? { completionRouteId: draft.completionRouteId.trim() }
      : {}),
    steps,
  };
}
