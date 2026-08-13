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

export function readAgencyRequestApproval(
  latestUserText: string | null,
): { action: "approve" | "cancel"; todoSlug: string } | null {
  if (!latestUserText) return null;
  const match = latestUserText.match(/<view_result>([\s\S]*?)<\/view_result>/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    if (
      value.kind !== "view_result" ||
      value.view !== "renderer" ||
      value.rendererSlug !== "approval-card" ||
      (value.actionId !== "approve" && value.actionId !== "cancel") ||
      typeof value.viewId !== "string"
    ) {
      return null;
    }
    const id = /^agency-request-([a-z0-9][a-z0-9_-]{0,63})$/.exec(
      value.viewId,
    );
    return id
      ? {
          action: value.actionId as "approve" | "cancel",
          todoSlug: id[1],
        }
      : null;
  } catch {
    return null;
  }
}
