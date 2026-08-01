import type {
  GuidedFlowDefinition,
  GuidedFlowInstance,
} from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import { evaluateGuidedFlowCompatibility } from "@kody-ade/kody-chat-dashboard/guided-flows/compatibility";
import { buildGuidedFlowView } from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import type { ViewRendererDefinition } from "../../../../src/dashboard/lib/view-renderers/definition";
import { resolveDashboardNavigationTarget } from "../../../../src/dashboard/lib/dashboard-navigation";

export function hasValidGuidedFlowCompletionRoute(
  definition: GuidedFlowDefinition,
): boolean {
  if (!definition.completionRouteId) return true;
  return !(
    "error" in
    resolveDashboardNavigationTarget({
      routeId: definition.completionRouteId,
      reason: `Open ${definition.title} results`,
    })
  );
}

function navigationForCompletion(definition: GuidedFlowDefinition) {
  if (!definition.completionRouteId) return undefined;
  const resolved = resolveDashboardNavigationTarget({
    routeId: definition.completionRouteId,
    reason: `Open ${definition.title} results`,
  });
  if ("error" in resolved) return undefined;
  return {
    action: "dashboard_navigate" as const,
    ...resolved,
  };
}

export function presentGuidedFlow(
  definition: GuidedFlowDefinition,
  instance: GuidedFlowInstance,
  renderers?: Readonly<Record<string, ViewRendererDefinition>>,
) {
  const compatibility =
    instance.status === "active"
      ? evaluateGuidedFlowCompatibility({
          definition,
          instance,
          renderers,
        })
      : ({ status: "compatible" } as const);
  return {
    instance,
    flow: {
      id: definition.id,
      title: definition.title,
      stepIndex: Math.max(
        0,
        definition.steps.findIndex(
          (step) => step.id === instance.currentStepId,
        ),
      ),
      stepCount: definition.steps.length,
    },
    compatibility,
    ...(instance.status === "active"
      ? compatibility.status === "compatible"
        ? { view: buildGuidedFlowView(definition, instance, renderers) }
        : {}
      : { navigation: navigationForCompletion(definition) }),
  };
}
