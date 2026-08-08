import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  resolveBackgroundToken: vi.fn(),
  dispatchWorkflowTriggers: vi.fn(),
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
