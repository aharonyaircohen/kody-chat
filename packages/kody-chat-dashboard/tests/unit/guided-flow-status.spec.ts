import { describe, expect, it } from "vitest";
import {
  buildGuidedFlowStatusView,
  getGuidedFlowDefinition,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import { validateGuidedFlowNavigation } from "../../app/api/kody/guided-flows/navigation";

describe("guided flow registry", () => {
  it("supports exact versions while exposing only the latest version per flow", () => {
    const latest = getGuidedFlowDefinition("create-workflow");

    expect(latest).not.toBeNull();
    expect(getGuidedFlowDefinition("create-workflow", latest?.version)).toBe(
      latest,
    );
    expect(getGuidedFlowDefinition("create-workflow", 999)).toBeNull();
    expect(
      listGuidedFlowDefinitions().filter(
        (definition) => definition.id === "create-workflow",
      ),
    ).toEqual([latest]);
  });

  it("registers onboarding as a manually started renderer-guided flow", () => {
    const onboarding = getGuidedFlowDefinition("onboarding");

    expect(onboarding).toMatchObject({
      id: "onboarding",
      title: "Get started with Kody",
      completionRouteId: "chat",
      steps: [
        {
          id: "welcome",
          rendererSlug: "approval-card",
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [
            {
              id: "next",
              target: {
                type: "step",
                stepId: "create-github-pat",
              },
            },
          ],
        },
        {
          id: "create-github-pat",
          rendererSlug: "approval-card",
          explanation: expect.stringMatching(
            /personal access token[\s\S]*`repo`[\s\S]*`workflow`[\s\S]*`admin:repo_hook`/i,
          ),
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [
            {
              id: "next",
              target: { type: "step", stepId: "connect-repository" },
            },
          ],
        },
        {
          id: "connect-repository",
          routeId: "org",
          rendererSlug: "approval-card",
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [
            {
              id: "next",
              target: { type: "step", stepId: "add-openrouter-key" },
            },
          ],
        },
        {
          id: "add-openrouter-key",
          routeId: "secrets",
          rendererSlug: "approval-card",
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [{ id: "next", target: { type: "step", stepId: "ready" } }],
        },
        {
          id: "ready",
          rendererSlug: "approval-card",
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [{ id: "finish", target: { type: "complete" } }],
        },
      ],
    });
    expect(
      listGuidedFlowDefinitions().filter(
        (definition) => definition.id === "onboarding",
      ),
    ).toEqual([onboarding]);
  });

  it("registers only built-in flows with valid dashboard destinations", () => {
    expect(
      listGuidedFlowDefinitions().map(validateGuidedFlowNavigation),
    ).toEqual(listGuidedFlowDefinitions().map(() => null));
  });
});

describe("guided flow status renderer", () => {
  it("renders status and safe navigation actions from data", () => {
    const view = buildGuidedFlowStatusView({
      instanceId: "flow-1",
      sessionId: "session-1",
      title: "Create a workflow",
      stepIndex: 0,
      stepCount: 2,
    });

    expect(view.rendererSlug).toBe("guided-flow-status");
    expect(view.resultTarget).toBe("chat");
    expect(view.ui).toEqual({
      type: "stack",
      children: [
        { type: "text", value: "Hi! I can help you with:", variant: "title" },
        { type: "text", value: "You have an unfinished GuidedFlow." },
        { type: "text", value: "Create a workflow · Step 1 of 2" },
        {
          type: "row",
          children: [
            {
              type: "button",
              label: "Resume flow",
              action: {
                id: "resume",
                label: "Resume flow",
                response: "resume",
                variant: "primary",
              },
            },
          ],
        },
      ],
    });
    expect(view.id).toBe("guided-flow-status-flow-1-session-1");
  });
});
