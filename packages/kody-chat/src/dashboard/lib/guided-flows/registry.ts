import type {
  GuidedFlowDefinition,
  GuidedFlowInstance,
  GuidedFlowStepDefinition,
} from "./controller";
import { getGuidedFlowStep } from "./controller";
import { getBuiltinViewRendererDefinition } from "@dashboard/lib/view-renderers/builtin";
import { buildRenderedViewDirective } from "@dashboard/lib/view-renderers/template";
import type { RenderedViewDirective } from "@dashboard/lib/chat-ui-actions";
import { providerLabel } from "@dashboard/lib/client-auth/catalog";

export const CREATE_WORKFLOW_FLOW_ID = "create-workflow";
export const CLIENT_SIGNIN_FLOW_ID = "client-signin";

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

const CLIENT_SIGNIN_FLOW: GuidedFlowDefinition = {
  id: CLIENT_SIGNIN_FLOW_ID,
  version: 1,
  title: "Client sign-in setup",
  completionRouteId: "brands",
  steps: [
    {
      id: "collect-credentials",
      title: "Enter sign-in credentials",
      explanation:
        "Save the provider credentials, then verify that the sign-in configuration resolves.",
      rendererSlug: "guided-form",
      rendererData: {
        title: "Configure client sign-in",
        body: "Enter the values for this provider.",
        fields: [
          { name: "clientId", label: "Client ID", value: "" },
          {
            name: "clientSecret",
            label: "Client secret",
            value: "",
            inputType: "password",
          },
          {
            name: "issuer",
            label: "Issuer (only if required)",
            value: "",
          },
        ],
        submitLabel: "Review credentials",
      },
      transitions: { submit: "review" },
    },
    {
      id: "review",
      title: "Review sign-in setup",
      explanation:
        "Confirm that Kody should save and verify these credentials.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Save these credentials?",
        body: "Kody will save the client ID and secret, then run the provider check.",
        actions: [
          {
            id: "approve",
            label: "Save and verify",
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

const DEFINITIONS: readonly GuidedFlowDefinition[] = [
  CREATE_WORKFLOW_FLOW,
  CLIENT_SIGNIN_FLOW,
];

export function getGuidedFlowDefinition(
  flowId: string,
): GuidedFlowDefinition | null {
  return DEFINITIONS.find((definition) => definition.id === flowId) ?? null;
}

export function listGuidedFlowDefinitions(): readonly GuidedFlowDefinition[] {
  return DEFINITIONS;
}

export function buildGuidedFlowView(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
): RenderedViewDirective {
  const step: GuidedFlowStepDefinition = getGuidedFlowStep(
    definition,
    instance,
  );
  const renderer = getBuiltinViewRendererDefinition(step.rendererSlug);
  if (!renderer) {
    throw new Error(`GuidedFlow renderer not found: ${step.rendererSlug}`);
  }

  const view = buildRenderedViewDirective({
    id: `guided-flow-${instance.instanceId}-${instance.revision}`,
    definition: renderer,
    data: {
      ...(step.rendererData ?? {}),
      ...(definition.id === CLIENT_SIGNIN_FLOW_ID &&
      step.id === "collect-credentials"
        ? {
            body: `Configure ${providerLabel(instance.instanceKey ?? "this provider")} sign-in. ${step.explanation}`,
          }
        : {}),
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
