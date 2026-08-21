import type { RenderedViewDirective } from "../chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../view-renderers/builtin";
import type { ViewRendererDefinition } from "../view-renderers/definition";
import { buildRenderedViewDirective } from "../view-renderers/template";
import { assertGuidedFlowCompatible } from "./compatibility";
import type { GuidedFlowDefinition, GuidedFlowInstance } from "./controller";
import {
  getGuidedFlowStep,
  isCommandGuidedFlowStep,
  isNestedGuidedFlowStep,
} from "./controller";
import { presentGuidedFlowControls } from "./controls";
import { buildGuidedFlowCommandView } from "./command-presentation";
import { guidedFlowRendererData } from "./render-data";
import { resolveCmsItemsSource } from "./cms-items";

export function buildGuidedFlowView(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  customRenderers?: Readonly<Record<string, ViewRendererDefinition>>,
): RenderedViewDirective {
  assertGuidedFlowCompatible({
    definition,
    instance,
    renderers: customRenderers,
  });
  const step = getGuidedFlowStep(definition, instance);
  if (isNestedGuidedFlowStep(step)) {
    throw new Error(`Nested GuidedFlow step "${step.id}" is not renderable`);
  }
  if (isCommandGuidedFlowStep(step)) {
    return buildGuidedFlowCommandView(definition, instance, step);
  }
  const renderer =
    (step.rendererVersion !== undefined
      ? customRenderers?.[`${step.rendererSlug}@${step.rendererVersion}`]
      : undefined) ??
    customRenderers?.[step.rendererSlug] ??
    getBuiltinViewRendererDefinition(step.rendererSlug);
  if (!renderer) {
    throw new Error(`GuidedFlow renderer not found: ${step.rendererSlug}`);
  }

  const view = buildRenderedViewDirective({
    id: `guided-flow-${instance.instanceId}-${instance.revision}`,
    definition: renderer,
    data: guidedFlowRendererData(step),
  });
  const controls = presentGuidedFlowControls({ definition, instance });

  return {
    ...view,
    ...(step.itemsSource
      ? { dataSource: resolveCmsItemsSource(step.itemsSource, instance.data) }
      : {}),
    resultTarget: "guided-flow",
    ui:
      controls.length > 0
        ? {
            type: "stack",
            children: [
              view.ui,
              {
                type: "row",
                children: controls,
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
