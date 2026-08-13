import type { RenderedViewDirective } from "../../chat-ui-actions";
import type { RenderedViewAction } from "../../chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../../view-renderers/builtin";
import { buildRenderedViewDirective } from "../../view-renderers/template";

export const PROJECT_ASSESSMENT_REQUEST =
  "Run a complete deep project assessment for this repository.";

export const PROJECT_ASSESSMENT_OPENING_ACTION: RenderedViewAction = {
  id: "run-project-assessment",
  label: "Run project assessment",
  response: PROJECT_ASSESSMENT_REQUEST,
  variant: "primary",
};

/** Supplies generic chat data to the existing opening-status renderer. */
export function buildRepositoryChatOpeningView(
  conversationId: string,
): RenderedViewDirective {
  const renderer = getBuiltinViewRendererDefinition("guided-flow-status");
  if (!renderer) throw new Error("Chat opening status renderer not found");

  return buildRenderedViewDirective({
    id: `chat-opening-${conversationId}`,
    definition: renderer,
    data: {
      greeting: "How can Kody help?",
      title: "Start with this repository.",
      step: "Ask about the code, plan work, or run a deep health check.",
      instanceId: conversationId,
      actions: [PROJECT_ASSESSMENT_OPENING_ACTION],
    },
  });
}
