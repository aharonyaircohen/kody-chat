import type {
  GuidedFlowDefinition,
  GuidedFlowInstance,
  GuidedFlowStepDefinition,
} from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import type { DashboardNavigateDirective } from "../../../../src/dashboard/lib/chat-ui-actions";
import { resolveDashboardNavigationTarget } from "../../../../src/dashboard/lib/dashboard-navigation";

export type GuidedFlowNavigationError =
  "invalid_completion_route" | "invalid_step_route";

export function validateGuidedFlowNavigation(
  definition: GuidedFlowDefinition,
): GuidedFlowNavigationError | null {
  if (
    definition.completionRouteId &&
    "error" in
      resolveDashboardNavigationTarget({
        routeId: definition.completionRouteId,
        parameters: definition.completionRouteParameters,
        reason: `Open ${definition.title} results`,
      })
  ) {
    return "invalid_completion_route";
  }
  for (const step of definition.steps) {
    if (
      step.routeId &&
      "error" in
        resolveDashboardNavigationTarget({
          routeId: step.routeId,
          parameters: step.routeParameters,
          reason: `Open ${step.title}`,
        })
    ) {
      return "invalid_step_route";
    }
  }
  return null;
}

export function navigationForCompletion(
  definition: GuidedFlowDefinition,
): DashboardNavigateDirective | undefined {
  if (!definition.completionRouteId) return undefined;
  const resolved = resolveDashboardNavigationTarget({
    routeId: definition.completionRouteId,
    parameters: definition.completionRouteParameters,
    reason: `Open ${definition.title} results`,
  });
  if ("error" in resolved) return undefined;
  return { action: "dashboard_navigate", ...resolved };
}

export function navigationForStep(
  step: GuidedFlowStepDefinition,
  instance: GuidedFlowInstance,
): DashboardNavigateDirective | undefined {
  if (!step.routeId) return undefined;
  const resolved = resolveDashboardNavigationTarget({
    routeId: step.routeId,
    parameters: step.routeParameters,
    reason: `Open ${step.title}`,
  });
  if ("error" in resolved) throw new Error(resolved.error);
  const directive: DashboardNavigateDirective = {
    action: "dashboard_navigate",
    ...resolved,
  };
  if (step.filePicker) {
    const params = new URLSearchParams();
    params.set("guidedFlowPicker", "1");
    params.set("instanceId", instance.instanceId);
    params.set("stepId", step.id);
    params.set("revision", String(instance.revision));
    params.set("resultField", step.filePicker.resultField);
    if (step.filePicker.extensions) {
      params.set("extensions", step.filePicker.extensions.join(","));
    }
    directive.href = `${directive.href}?${params.toString()}`;
  }
  return directive;
}
