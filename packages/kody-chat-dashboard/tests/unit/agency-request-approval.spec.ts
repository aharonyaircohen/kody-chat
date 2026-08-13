import { describe, expect, it } from "vitest";

import {
  createAgencyRequestApproval,
  readAgencyRequestApproval,
  runApprovedAgencyRequestDirectly,
} from "../../app/api/kody/chat/tools/agency-request-approval";
import { vi } from "vitest";

describe("Agency request approval view", () => {
  it("builds the standard approval card deterministically", () => {
    const directive = createAgencyRequestApproval({
      todoSlug: "keep-ci-passing",
    });

    expect(directive.id).toBe("agency-request-keep-ci-passing");
    expect(directive.rendererSlug).toBe("approval-card");
    expect(JSON.stringify(directive.ui)).toContain("Approve");
    expect(JSON.stringify(directive.ui)).toContain("Cancel");
  });

  it("accepts only the matching server-built approve result", () => {
    const approved = {
      kind: "view_result",
      view: "renderer",
      viewId: "agency-request-keep-ci-passing",
      rendererSlug: "approval-card",
      actionId: "approve",
    };

    expect(
      readAgencyRequestApproval(
        `<view_result>${JSON.stringify(approved)}</view_result>`,
      ),
    ).toEqual({ action: "approve", todoSlug: "keep-ci-passing" });
    expect(
      readAgencyRequestApproval(
        `<view_result>${JSON.stringify({ ...approved, viewId: "other" })}</view_result>`,
      ),
    ).toBeNull();
  });

  it("executes an approved request directly and streams its run id", async () => {
    const runAgencyRequest = vi.fn(async () => ({
      kind: "started",
      runId: "run-123",
    }));

    const response = await runApprovedAgencyRequestDirectly({
      approval: { action: "approve", todoSlug: "keep-ci-passing" },
      runAgencyRequest,
    });
    const body = await response.text();

    expect(runAgencyRequest).toHaveBeenCalledOnce();
    expect(runAgencyRequest).toHaveBeenCalledWith("keep-ci-passing");
    expect(body).toContain("Agency request is monitoring workflow run run-123.");
  });
});
