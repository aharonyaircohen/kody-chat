import { describe, expect, it } from "vitest";
import { ONBOARDING_FLOW } from "../../src/dashboard/lib/guided-flows/builtins/onboarding";

describe("onboarding provider branch", () => {
  it("offers OpenRouter, xKiro, and skip actions", () => {
    const step = ONBOARDING_FLOW.steps.find(
      (candidate) => candidate.id === "choose-chat-provider",
    );
    const viewStep = step && "rendererData" in step ? step : undefined;

    expect(viewStep?.rendererData).toMatchObject({
      actions: [
        { id: "openrouter", label: "Set up OpenRouter" },
        { id: "xkiro", label: "Set up xKiro" },
        { id: "skip", label: "Skip for now" },
      ],
    });
    expect(step?.actions).toEqual([
      { id: "openrouter", target: { type: "step", stepId: "add-openrouter-key" } },
      { id: "xkiro", target: { type: "step", stepId: "add-xkiro-key" } },
      { id: "skip", target: { type: "complete" } },
    ]);
  });
});
