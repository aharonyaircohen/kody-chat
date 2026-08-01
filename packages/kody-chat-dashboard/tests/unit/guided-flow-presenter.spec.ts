import { describe, expect, it } from "vitest";

import { presentGuidedFlow } from "../../app/api/kody/guided-flows/presenter";
import {
  advanceGuidedFlow,
  createGuidedFlowInstance,
  type GuidedFlowDefinition,
} from "../../src/dashboard/lib/guided-flows/controller";

const DEFINITION: GuidedFlowDefinition = {
  id: "navigation-flow",
  version: 1,
  title: "Navigation flow",
  completionRouteId: "chat",
  steps: [
    {
      id: "welcome",
      title: "Welcome",
      explanation: "Start here.",
      rendererSlug: "approval-card",
      rendererData: {
        body: "This legacy body must not become a second instruction source.",
      },
      actions: [{ id: "next", target: { type: "step", stepId: "configure" } }],
    },
    {
      id: "configure",
      title: "Configure",
      explanation: "Complete the page, then click Next.",
      rendererSlug: "approval-card",
      routeId: "secrets",
      actions: [{ id: "next", target: { type: "complete" } }],
    },
  ],
};

describe("GuidedFlow presenter navigation", () => {
  it("navigates to the page owned by the active step", () => {
    const started = createGuidedFlowInstance(DEFINITION, "instance-1");
    const atConfigure = advanceGuidedFlow(DEFINITION, started, {
      actionId: "next",
    });

    expect(presentGuidedFlow(DEFINITION, atConfigure).navigation).toEqual({
      action: "dashboard_navigate",
      routeId: "secrets",
      href: "/secrets",
      label: "Secrets",
      reason: "Open Configure",
    });
  });

  it("does not navigate when the active step has no page", () => {
    const started = createGuidedFlowInstance(DEFINITION, "instance-1");

    expect(presentGuidedFlow(DEFINITION, started).navigation).toBeUndefined();
  });

  it("renders the step explanation once as the instruction source", () => {
    const started = createGuidedFlowInstance(DEFINITION, "instance-1");
    const rendered = JSON.stringify(
      presentGuidedFlow(DEFINITION, started).view?.ui,
    );

    expect(rendered.match(/Start here\./g)).toHaveLength(1);
    expect(rendered).not.toContain("legacy body");
  });

  it("rejects an invalid active-step page instead of silently ignoring it", () => {
    const invalidDefinition: GuidedFlowDefinition = {
      ...DEFINITION,
      steps: [
        {
          ...DEFINITION.steps[0],
          routeId: "not-a-dashboard-page",
        },
      ],
    };
    const started = createGuidedFlowInstance(invalidDefinition, "instance-1");

    expect(() => presentGuidedFlow(invalidDefinition, started)).toThrow(
      'Unknown dashboard route "not-a-dashboard-page"',
    );
  });
});
