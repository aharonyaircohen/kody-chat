import { canonicalWorkflowInput } from "@kody-ade/agency/workflow-run-approval";

import type { RenderedViewDirective } from "../../../../../src/dashboard/lib/chat-ui-actions";
import { getBuiltinViewRendererDefinition } from "../../../../../src/dashboard/lib/view-renderers/builtin";
import { buildRenderedViewDirective } from "../../../../../src/dashboard/lib/view-renderers/template";

export function createWorkflowRunApproval(input: {
  owner: string;
  repo: string;
  workflowId: string;
  workflowInput: Record<string, unknown>;
  approvalToken: string;
}): RenderedViewDirective {
  const definition = getBuiltinViewRendererDefinition("approval-card");
  if (!definition) throw new Error("Approval card renderer is unavailable");
  return buildRenderedViewDirective({
    id: input.approvalToken,
    definition,
    data: {
      title: `Run ${input.workflowId}?`,
      body: `Repository: ${input.owner}/${input.repo}\nInput: ${canonicalWorkflowInput(input.workflowInput)}`,
    },
  });
}

export function readWorkflowRunApprovalToken(
  latestUserText: string | null,
): string | null {
  if (!latestUserText) return null;
  const match = latestUserText.match(/<view_result>([\s\S]*?)<\/view_result>/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    if (
      value.kind !== "view_result" ||
      value.view !== "renderer" ||
      value.rendererSlug !== "approval-card" ||
      value.actionId !== "approve" ||
      typeof value.viewId !== "string"
    ) {
      return null;
    }
    return value.viewId;
  } catch {
    return null;
  }
}
