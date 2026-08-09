import { describe, expect, it } from "vitest";
import {
  buildGuidedFlowStatusView,
  getGuidedFlowDefinition,
  INITIALIZE_KODY_ENGINE_FLOW_ID,
  listGuidedFlowDefinitions,
} from "@kody-ade/kody-chat-dashboard/guided-flows/registry";
import { isCommandGuidedFlowStep } from "@kody-ade/kody-chat-dashboard/guided-flows/controller";
import { validateGuidedFlowNavigation } from "../../app/api/kody/guided-flows/navigation";
import { availableGuidedFlowDefinitions } from "../../app/api/kody/guided-flows/catalog";

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
      version: 3,
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
              id: "finish",
              target: { type: "complete" },
            },
            {
              id: "repository",
              target: {
                type: "step",
                stepId: "attach-repository",
              },
            },
          ],
        },
        {
          id: "attach-repository",
          routeId: "org",
          rendererSlug: "approval-card",
          rendererData: {
            actions: expect.any(Array),
          },
          actions: [
            {
              id: "continue",
              target: { type: "step", stepId: "initialize-repository" },
            },
          ],
        },
        {
          id: "initialize-repository",
          type: "command",
          command: "/init",
          actions: [
            { id: "run", target: { type: "stay" } },
            { id: "finish", target: { type: "complete" } },
          ],
        },
      ],
    });
    expect(onboarding?.steps[1]?.explanation).toContain(
      "Webhooks: Read and write",
    );
    expect(onboarding?.steps[1]?.explanation).toContain("admin:repo_hook");
    expect(onboarding?.steps.map((step) => step.id)).not.toContain(
      "create-github-pat",
    );
    expect(onboarding?.steps.map((step) => step.routeId)).not.toContain(
      "secrets",
    );
    expect(getGuidedFlowDefinition("onboarding", 1)).not.toBeNull();
    expect(getGuidedFlowDefinition("onboarding", 2)).not.toBeNull();
    expect(
      listGuidedFlowDefinitions().filter(
        (definition) => definition.id === "onboarding",
      ),
    ).toEqual([onboarding]);
  });

  it("registers Init Engine as a built-in command-guided flow", () => {
    const initEngine = getGuidedFlowDefinition(INITIALIZE_KODY_ENGINE_FLOW_ID);

    expect(initEngine).toMatchObject({
      id: "initialize-kody-engine",
      title: "Initialize Kody Engine",
      version: 1,
      controls: ["back"],
    });
    const commandStep = initEngine?.steps.find(isCommandGuidedFlowStep);
    expect(commandStep).toMatchObject({
      type: "command",
      command: "/init",
      actions: [
        { id: "run", target: { type: "stay" } },
        { id: "continue", target: { type: "step", stepId: "review" } },
      ],
    });
    expect(
      listGuidedFlowDefinitions().filter(
        (definition) => definition.id === INITIALIZE_KODY_ENGINE_FLOW_ID,
      ),
    ).toEqual([initEngine]);
  });

  it("registers UI login setup as an optional guided flow", () => {
    const setup = getGuidedFlowDefinition("setup-ui-login");

    expect(setup).toMatchObject({
      id: "setup-ui-login",
      title: "Set up UI testing",
      version: 1,
      completionRouteId: "chat",
      controls: ["back"],
      steps: [
        {
          id: "choose",
          actions: [
            {
              id: "setup",
              target: { type: "step", stepId: "save-username" },
            },
            { id: "skip", target: { type: "complete" } },
          ],
        },
        {
          id: "save-username",
          routeId: "variables",
          actions: [
            {
              id: "continue",
              target: { type: "step", stepId: "save-password" },
            },
          ],
        },
        {
          id: "save-password",
          routeId: "secrets",
          actions: [
            {
              id: "continue",
              target: { type: "step", stepId: "ready" },
            },
          ],
        },
        {
          id: "ready",
          actions: [{ id: "finish", target: { type: "complete" } }],
        },
      ],
    });
    expect(setup?.steps[1]?.explanation).toContain("LOGIN_USER");
    expect(setup?.steps[2]?.explanation).toContain("LOGIN_PASSWORD");
    expect(
      listGuidedFlowDefinitions().filter(
        (definition) => definition.id === "setup-ui-login",
      ),
    ).toEqual([setup]);
  });

  it("keeps the built-in Init Engine definition authoritative over legacy stored copies", () => {
    const builtIn = getGuidedFlowDefinition(INITIALIZE_KODY_ENGINE_FLOW_ID);
    expect(builtIn).not.toBeNull();

    const available = availableGuidedFlowDefinitions([
      {
        ...builtIn!,
        version: 99,
        title: "Legacy repository copy",
      },
    ]);

    expect(
      available.filter(
        (definition) => definition.id === INITIALIZE_KODY_ENGINE_FLOW_ID,
      ),
    ).toEqual([builtIn]);
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
