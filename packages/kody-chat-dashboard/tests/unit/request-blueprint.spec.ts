import { describe, expect, it } from "vitest";

import {
  buildGuidedFlowFromRequestBlueprint,
  buildRequestBlueprintModelGuide,
  type RequestBlueprintDefinition,
} from "../../src/dashboard/lib/request-blueprints";

const definition: RequestBlueprintDefinition = {
  id: "full-guidance",
  version: 2,
  title: "Full guidance",
  purpose: "Prepare, run, review, and finish one guided operation.",
  completionRouteId: "chat",
  completionRouteParameters: { mode: "guided" },
  controls: ["back"],
  onComplete: { action: "agency-request.submit" },
  steps: [
    {
      id: "prepare",
      title: "Prepare",
      explanation: "Confirm the target before continuing.",
      authoringGoal: "Make the target explicit.",
      rendererSlug: "approval-card",
      rendererVersion: 1,
      rendererData: { title: "Prepare", tone: "caution" },
      actions: [{ id: "continue", target: { type: "step", stepId: "run" } }],
    },
    {
      id: "run",
      type: "command",
      title: "Run",
      explanation: "Run the repository command.",
      command: "/init",
      actions: [
        { id: "run", target: { type: "stay" } },
        { id: "continue", target: { type: "step", stepId: "review" } },
      ],
    },
    {
      id: "review",
      title: "Review",
      explanation: "Review the generated files.",
      routeId: "files",
      routeParameters: { path: ".github/workflows" },
      rendererSlug: "approval-card",
      actions: [{ id: "finish", target: { type: "step", stepId: "details" } }],
    },
    {
      id: "details",
      type: "flow",
      title: "Details",
      explanation: "Complete the nested guidance.",
      flowId: "nested-details",
      flowVersion: 3,
      actions: [{ id: "done", target: { type: "complete" } }],
    },
  ],
};

describe("Request Blueprint", () => {
  it("generates the complete Guided Flow contract without losing behavior", () => {
    expect(buildGuidedFlowFromRequestBlueprint(definition)).toEqual({
      id: definition.id,
      version: definition.version,
      title: definition.title,
      completionRouteId: definition.completionRouteId,
      completionRouteParameters: definition.completionRouteParameters,
      controls: definition.controls,
      onComplete: definition.onComplete,
      steps: definition.steps,
    });
  });

  it("generates Kody guidance for views, commands, routes, nesting, and actions", () => {
    const guide = buildRequestBlueprintModelGuide(definition);

    expect(guide).toContain(definition.purpose);
    expect(guide).toContain("prepare [view: approval-card@1]");
    expect(guide).toContain(
      'renderer data: {"title":"Prepare","tone":"caution"}',
    );
    expect(guide).toContain("run [command: /init]");
    expect(guide).toContain("review [view: approval-card]");
    expect(guide).toContain('route: files {"path":".github/workflows"}');
    expect(guide).toContain("details [flow: nested-details@3]");
    expect(guide).toContain("continue -> step:run");
    expect(guide).toContain("finish -> step:details");
    expect(guide).toContain('completion route: chat {"mode":"guided"}');
  });

  it("rejects duplicate steps and missing action targets", () => {
    expect(() =>
      buildGuidedFlowFromRequestBlueprint({
        ...definition,
        steps: [...definition.steps, definition.steps[0]!],
      }),
    ).toThrow(/duplicate step id/i);

    expect(() =>
      buildGuidedFlowFromRequestBlueprint({
        ...definition,
        steps: [
          {
            ...definition.steps[0]!,
            actions: [
              {
                id: "continue",
                target: { type: "step", stepId: "missing" },
              },
            ],
          },
        ],
      }),
    ).toThrow(/unknown step target/i);
  });
});
