import type {
  GuidedFlowDefinition,
  GuidedFlowInstance,
  GuidedFlowStepDefinition,
} from "./controller";
import { getGuidedFlowStep } from "./controller";
import { getBuiltinViewRendererDefinition } from "@dashboard/lib/view-renderers/builtin";
import { buildRenderedViewDirective } from "@dashboard/lib/view-renderers/template";
import type { RenderedViewDirective } from "@dashboard/lib/chat-ui-actions";

export const CREATE_WORKFLOW_FLOW_ID = "create-workflow";

const CREATE_WORKFLOW_FLOW: GuidedFlowDefinition = {
  id: CREATE_WORKFLOW_FLOW_ID,
  version: 1,
  title: "Create a workflow",
  completionRouteId: "workflows",
  steps: [
    {
      id: "choose-capability",
      title: "Describe the workflow",
      explanation:
        "Give the workflow a name and the capability slug it should run.",
      rendererSlug: "guided-form",
      rendererData: {
        title: "What should this workflow run?",
        body: "Use a capability slug that already exists in this repository.",
        fields: [
          { name: "workflowName", label: "Workflow name", value: "" },
          { name: "capabilitySlug", label: "Capability slug", value: "" },
        ],
        submitLabel: "Review workflow",
      },
      transitions: { submit: "review" },
    },
    {
      id: "review",
      title: "Review workflow setup",
      explanation: "Confirm this starting point before creating the workflow.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Create this workflow?",
        body: "Kody will create the workflow definition and open the Workflows page.",
        actions: [
          {
            id: "approve",
            label: "Create workflow",
            response: "approve",
            variant: "primary",
          },
          {
            id: "cancel",
            label: "Cancel",
            response: "cancel",
            variant: "secondary",
          },
        ],
      },
      allowedActions: ["approve", "cancel"],
    },
  ],
};

const DEFINITIONS: readonly GuidedFlowDefinition[] = [CREATE_WORKFLOW_FLOW];

export function getGuidedFlowDefinition(
  flowId: string,
  version?: number,
): GuidedFlowDefinition | null {
  const matches = DEFINITIONS.filter(
    (definition) =>
      definition.id === flowId &&
      (version === undefined || definition.version === version),
  );
  return (
    matches.reduce<GuidedFlowDefinition | null>(
      (latest, definition) =>
        !latest || definition.version > latest.version ? definition : latest,
      null,
    ) ?? null
  );
}

export function listGuidedFlowDefinitions(): readonly GuidedFlowDefinition[] {
  const latestById = new Map<string, GuidedFlowDefinition>();
  for (const definition of DEFINITIONS) {
    const latest = latestById.get(definition.id);
    if (!latest || definition.version > latest.version) {
      latestById.set(definition.id, definition);
    }
  }
  return [...latestById.values()];
}

export function buildGuidedFlowView(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  customRenderers?: Readonly<
    Record<string, import("@dashboard/lib/view-renderers/definition").ViewRendererDefinition>
  >,
): RenderedViewDirective {
  const step: GuidedFlowStepDefinition = getGuidedFlowStep(
    definition,
    instance,
  );
  const renderer =
    customRenderers?.[step.rendererSlug] ??
    getBuiltinViewRendererDefinition(step.rendererSlug);
  if (!renderer) {
    throw new Error(`GuidedFlow renderer not found: ${step.rendererSlug}`);
  }

  const view = buildRenderedViewDirective({
    id: `guided-flow-${instance.instanceId}-${instance.revision}`,
    definition: renderer,
    data: {
      ...(step.rendererData ?? {}),
      ...(typeof step.rendererData?.body === "string"
        ? { body: `${step.explanation}\n\n${step.rendererData.body}` }
        : { body: step.explanation }),
    },
  });

  return {
    ...view,
    resultTarget: "guided-flow",
    ui:
      instance.history.length > 0
        ? {
            type: "stack",
            children: [
              view.ui,
              {
                type: "row",
                children: [
                  {
                    type: "button",
                    label: "Back",
                    action: {
                      id: "back",
                      label: "Back",
                      response: "back",
                      variant: "secondary",
                    },
                  },
                ],
              },
            ],
          }
        : view.ui,
    guidedFlow: {
      instanceId: instance.instanceId,
      stepId: step.id,
      revision: instance.revision,
    },
  };
}

export function buildGuidedFlowStatusView({
  instanceId,
  sessionId,
  title,
  stepIndex,
  stepCount,
}: {
  instanceId: string;
  sessionId: string;
  title: string;
  stepIndex: number;
  stepCount: number;
}): RenderedViewDirective {
  const renderer = getBuiltinViewRendererDefinition("guided-flow-status");
  if (!renderer) throw new Error("GuidedFlow status renderer not found");

  return buildRenderedViewDirective({
    id: `guided-flow-status-${instanceId}-${sessionId}`,
    definition: renderer,
    data: {
      greeting: "Hi! I can help you with:",
      title: "You have an unfinished GuidedFlow.",
      step: `${title} · Step ${stepIndex + 1} of ${stepCount}`,
      instanceId,
      actions: [
        {
          id: "resume",
          label: "Resume flow",
          response: "resume",
          variant: "primary",
        },
      ],
    },
  });
}
