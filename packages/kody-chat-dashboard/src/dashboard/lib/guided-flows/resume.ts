import type { RenderedViewDirective } from "../chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../view-renderers/builtin";
import { buildRenderedViewDirective } from "../view-renderers/template";
import type { GuidedFlowCompatibility } from "./compatibility";

export interface GuidedFlowResumeCandidate {
  readonly instance: {
    readonly instanceId: string;
    readonly revision: number;
    readonly status: "active" | "completed" | "cancelled";
  };
  readonly flow: {
    readonly title: string;
    readonly stepIndex: number;
    readonly stepCount: number;
  };
  readonly compatibility: GuidedFlowCompatibility;
}

export function buildGuidedFlowResumeView({
  sessionId,
  flows,
}: {
  sessionId: string;
  flows: readonly GuidedFlowResumeCandidate[];
}): RenderedViewDirective {
  const renderer = getBuiltinViewRendererDefinition("guided-flow-status");
  if (!renderer) throw new Error("GuidedFlow status renderer not found");
  const active = flows.filter(
    (candidate) => candidate.instance.status === "active",
  );
  const compatible = active.filter(
    (candidate) => candidate.compatibility.status === "compatible",
  );
  const incompatible = active.filter(
    (candidate) => candidate.compatibility.status === "incompatible",
  );
  const actions = [
    ...compatible.map((candidate) => ({
      id: "resume",
      label:
        compatible.length === 1 && incompatible.length === 0
          ? "Resume flow"
          : `${candidate.flow.title} · Step ${candidate.flow.stepIndex + 1} of ${candidate.flow.stepCount}`,
      response: "resume",
      variant: "primary" as const,
      result: { instanceId: candidate.instance.instanceId },
    })),
    ...incompatible.map((candidate) => ({
      id: "cancel",
      label: `Remove unavailable flow: ${candidate.flow.title}`,
      response: "cancel",
      variant: "secondary" as const,
      result: {
        instanceId: candidate.instance.instanceId,
        expectedRevision: candidate.instance.revision,
      },
    })),
  ];
  const title =
    compatible.length === 0
      ? "A saved flow can no longer be opened."
      : compatible.length === 1 && incompatible.length === 0
        ? "You have an unfinished GuidedFlow."
        : "Choose a GuidedFlow to continue.";
  const step =
    compatible.length === 0
      ? incompatible[0]?.compatibility.status === "incompatible"
        ? incompatible[0].compatibility.message
        : "The saved flow is unavailable."
      : compatible.length === 1 && incompatible.length === 0
        ? `${compatible[0].flow.title} · Step ${compatible[0].flow.stepIndex + 1} of ${compatible[0].flow.stepCount}`
        : incompatible.length > 0
          ? `${compatible.length} available · ${incompatible.length} unavailable`
          : `${compatible.length} available`;

  return buildRenderedViewDirective({
    id: `guided-flow-resume-${sessionId}`,
    definition: renderer,
    data: {
      greeting: "Hi! I can help you with:",
      title,
      step,
      instanceId: compatible[0]?.instance.instanceId ?? sessionId,
      actions,
    },
  });
}
