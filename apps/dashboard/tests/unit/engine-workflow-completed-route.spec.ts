import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  resolveBackgroundToken: vi.fn(),
  dispatchWorkflowTriggers: vi.fn(),
  deliverWorkflowInboxAlert: vi.fn(),
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@dashboard/lib/backend/github-actions-identity", () => ({
  bearerToken: (request: Request) =>
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
  verifyGitHubWorkflowIdentity: h.verify,
}));
vi.mock("@kody-ade/base/auth/background-token", () => ({
  resolveBackgroundToken: h.resolveBackgroundToken,
}));
vi.mock("@kody-ade/base/github/core", () => ({
  createUserOctokit: vi.fn(() => ({ authenticated: true })),
}));
vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: h.setGitHubContext,
  clearGitHubContext: h.clearGitHubContext,
}));
vi.mock(
  "@dashboard/features/workflows/server/github-workflow-trigger-dispatch",
  () => ({ dispatchWorkflowTriggers: h.dispatchWorkflowTriggers }),
);
vi.mock(
  "@dashboard/features/workflows/server/workflow-inbox-alert",
  () => ({ deliverWorkflowInboxAlert: h.deliverWorkflowInboxAlert }),
);

import { POST } from "../../app/api/kody/engine/workflow-completed/route";

function request(body: unknown) {
  return new Request("http://localhost/api/kody/engine/workflow-completed", {
    method: "POST",
    headers: {
      authorization: "Bearer signed-github-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/kody/engine/workflow-completed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.verify.mockResolvedValue({
      repository: "acme/shop",
      actor: "kody",
      runId: "42",
    });
    h.resolveBackgroundToken.mockResolvedValue({ token: "background-token" });
    h.dispatchWorkflowTriggers.mockResolvedValue(undefined);
    h.deliverWorkflowInboxAlert.mockResolvedValue(undefined);
  });

  it("notifies repository operators when a workflow is blocked", async () => {
    const response = await POST(
      request({
        workflowId: "review-merge",
        runId: "workflow-run-8",
        status: "blocked",
        summary:
          "UI Review could not run because LOGIN_PASSWORD is missing.",
        output: { pr: 3947 },
      }),
    );

    expect(response.status).toBe(204);
    expect(h.deliverWorkflowInboxAlert).toHaveBeenCalledWith({
      owner: "acme",
      repo: "shop",
      workflowId: "review-merge",
      runId: "workflow-run-8",
      summary: "UI Review could not run because LOGIN_PASSWORD is missing.",
      url: "http://localhost/repo/acme/shop/workflows/review-merge",
      octokit: { authenticated: true },
    });
    expect(h.dispatchWorkflowTriggers).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          payload: expect.objectContaining({ status: "blocked" }),
        }),
      }),
    );
  });

  it("does not add an Inbox alert for a successful workflow", async () => {
    const response = await POST(
      request({
        workflowId: "review-merge",
        runId: "workflow-run-9",
        status: "success",
      }),
    );

    expect(response.status).toBe(204);
    expect(h.deliverWorkflowInboxAlert).not.toHaveBeenCalled();
  });

  it("keeps the completed workflow intact when Inbox delivery fails", async () => {
    h.deliverWorkflowInboxAlert.mockRejectedValueOnce(
      new Error("Inbox unavailable"),
    );

    const response = await POST(
      request({
        workflowId: "review-merge",
        runId: "workflow-run-10",
        status: "blocked",
        summary: "QA credentials are missing.",
      }),
    );

    expect(response.status).toBe(204);
    expect(h.dispatchWorkflowTriggers).toHaveBeenCalledTimes(1);
  });

  it("dispatches a repository-scoped Kody workflow completion event", async () => {
    const response = await POST(
      request({
        workflowId: "ci-repair",
        runId: "workflow-run-7",
        status: "success",
        output: { pr: 3947, headSha: "abcdef1234567" },
      }),
    );

    expect(response.status).toBe(204);
    expect(h.setGitHubContext).toHaveBeenCalledWith(
      "acme",
      "shop",
      "background-token",
    );
    expect(h.dispatchWorkflowTriggers).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "kody-workflow:ci-repair:workflow-run-7",
        event: expect.objectContaining({
          name: "kody.workflow.completed",
          brand: { owner: "acme", repo: "shop" },
          payload: expect.objectContaining({
            workflowId: "ci-repair",
            runId: "workflow-run-7",
            status: "success",
            pr: 3947,
          }),
        }),
      }),
    );
    expect(h.clearGitHubContext).toHaveBeenCalledTimes(1);
  });

  it("rejects a forged repository field", async () => {
    const response = await POST(
      request({
        workflowId: "ci-repair",
        runId: "workflow-run-7",
        status: "success",
        repository: "attacker/repo",
      }),
    );

    expect(response.status).toBe(400);
    expect(h.dispatchWorkflowTriggers).not.toHaveBeenCalled();
  });
});
