import { describe, expect, it } from "vitest";

import {
  createWorkflowRunApproval,
  readWorkflowRunApprovalToken,
} from "../../app/api/kody/chat/tools/workflow-run-approval";

describe("Chat workflow approval view", () => {
  it("renders the server challenge and returns it only for an approve click", () => {
    const directive = createWorkflowRunApproval({
      owner: "acme",
      repo: "app",
      workflowId: "documentation-agency",
      workflowInput: { issue: 42 },
      approvalToken: "server.challenge",
    });
    expect(directive.id).toBe("server.challenge");

    const result = {
      kind: "view_result",
      view: "renderer",
      viewId: directive.id,
      rendererSlug: "approval-card",
      actionId: "approve",
    };
    expect(
      readWorkflowRunApprovalToken(
        `<view_result>${JSON.stringify(result)}</view_result>`,
      ),
    ).toBe("server.challenge");
    expect(
      readWorkflowRunApprovalToken(
        `<view_result>${JSON.stringify({
          ...result,
          actionId: "cancel",
        })}</view_result>`,
      ),
    ).toBeNull();
  });
});
