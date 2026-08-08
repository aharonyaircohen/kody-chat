import type { RenderedViewDirective } from "../chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../view-renderers/builtin";
import { buildRenderedViewDirective } from "../view-renderers/template";
import type {
  GuidedFlowCommandStepDefinition,
  GuidedFlowDefinition,
  GuidedFlowInstance,
} from "./model";
import { guidedFlowStepResult } from "./step-results";

export function buildGuidedFlowCommandView(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  step: GuidedFlowCommandStepDefinition,
): RenderedViewDirective {
  const renderer = getBuiltinViewRendererDefinition("guided-flow-command");
  if (!renderer) throw new Error("GuidedFlow command renderer not found");
  const result = guidedFlowStepResult(definition, instance, step.id);
  const completed = result?.status === "completed";
  const view = buildRenderedViewDirective({
    id: `guided-flow-${instance.instanceId}-${instance.revision}`,
    definition: renderer,
    data: {
      title: step.title,
      body: step.explanation,
      command: step.command,
      status: completed ? "completed" : "ready",
      summary:
        typeof result?.summary === "string"
          ? result.summary
          : completed
            ? "Command completed."
            : "Ready to run.",
      actions: completed
        ? [
            {
              id: "run",
              label: "Run again",
              response: "run",
              variant: "secondary",
            },
            {
              id: "continue",
              label: "Continue",
              response: "continue",
              variant: "primary",
            },
          ]
        : [
            {
              id: "run",
              label: "Run command",
              response: "run",
              variant: "primary",
            },
          ],
    },
  });
  return {
    ...view,
    resultTarget: "guided-flow",
    guidedFlow: {
      instanceId: instance.instanceId,
      stepId: step.id,
      revision: instance.revision,
    },
  };
}
