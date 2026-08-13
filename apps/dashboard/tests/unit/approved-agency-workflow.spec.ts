import { describe, expect, it, vi } from "vitest";

import { dispatchApprovedAgencyWorkflow } from "../../src/dashboard/features/agency/server/approved-agency-workflow";

const request = {
  url: "https://dash.test/api/kody/agency-requests/keep-ci/run",
  headers: new Headers({ authorization: "Bearer user" }),
};
const execution = {
  workflowId: "ci-repair",
  input: { branch: "main", ciRunId: 123 },
};

describe("approved Agency Workflow dispatch", () => {
  it("uses one Agency approval to challenge, approve, and dispatch", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: "approval_required", approvalToken: "challenge" },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ approvalId: "approval-1" }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json({ runId: "run-1" }, { status: 202 }),
      );

    await expect(
      dispatchApprovedAgencyWorkflow({
        request,
        execution,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ runId: "run-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(await fetchImpl.mock.calls[2]?.[1]?.body).toContain("approval-1");
  });

  it("dispatches directly when the Workflow needs no separate approval", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ runId: "run-direct" }, { status: 202 }),
    );

    await expect(
      dispatchApprovedAgencyWorkflow({
        request,
        execution,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).resolves.toEqual({ runId: "run-direct" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not expose a server failure body", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { error: "dispatch_failed", message: "secret provider response" },
        { status: 500 },
      ),
    );

    await expect(
      dispatchApprovedAgencyWorkflow({
        request,
        execution,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow("Workflow dispatch failed");
  });
});
