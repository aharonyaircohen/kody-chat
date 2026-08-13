import type { RenderedViewDirective } from "../../../../../src/dashboard/lib/chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/builtin";
import { buildRenderedViewDirective } from "../../../../../src/dashboard/lib/view-renderers/template";

export function createAgencyRequestApproval(input: {
  todoSlug: string;
}): RenderedViewDirective {
  const definition = getBuiltinViewRendererDefinition("approval-card");
  if (!definition) throw new Error("Approval card renderer is unavailable");
  return buildRenderedViewDirective({
    id: `agency-request-${input.todoSlug}`,
    definition,
    data: {
      title: "Approve this Agency plan?",
      body:
        "Kody saved the verified plan and boundaries on the Agency request Todo. Approve to begin execution, or cancel to leave it waiting for approval.",
    },
  });
}
