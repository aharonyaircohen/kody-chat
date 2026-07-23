import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getUserOctokit: vi.fn(),
  listStoredAgencyDefinitions: vi.fn(),
  listStoredAgencyStates: vi.fn(),
  buildKodyWorkflowDispatchInputs: vi.fn(async () => ({
    implementation: "goal-manager",
    message: "web-release",
  })),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  getUserOctokit: h.getUserOctokit,
  getRequestAuth: vi.fn(() => ({
    owner: "test-owner",
    repo: "test-repo",
    token: "ghp_test-token",
  })),
}));

vi.mock("@dashboard/lib/activity/audit", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@kody-ade/agency/backend/agency-model-store", () => ({
  listStoredAgencyDefinitions: h.listStoredAgencyDefinitions,
  listStoredAgencyStates: h.listStoredAgencyStates,
}));

vi.mock("@dashboard/lib/kody-workflow-dispatch", () => ({
  buildKodyWorkflowDispatchInputs: h.buildKodyWorkflowDispatchInputs,
}));

import { POST } from "../../app/api/kody/goals/managed/[id]/run/route";

function makeRequest(id: string) {
  return new NextRequest(`https://dash.test/api/kody/goals/managed/${id}/run`, {
    method: "POST",
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("managed goal run route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches goal-manager through kody.yml with the goal id", async () => {
    const createWorkflowDispatch = vi.fn(async () => ({}));
    const mockOctokit = {
      rest: {
        repos: {
          get: vi.fn(async () => ({
            data: { default_branch: "dev" },
          })),
        },
        actions: {
          createWorkflowDispatch,
        },
      },
    };

    h.getUserOctokit.mockResolvedValue(mockOctokit);
    h.listStoredAgencyDefinitions.mockResolvedValue([
      {
        recordId: "goal:web-release:current",
        kind: "goal",
        data: { id: "web-release" },
        createdAt: "2026-07-23T00:00:00.000Z",
      },
    ]);
    h.listStoredAgencyStates.mockResolvedValue([
      {
        definitionId: "web-release",
        kind: "goal",
        data: { definitionId: "web-release", lifecycle: "active" },
      },
    ]);

    const res = await POST(
      makeRequest("web-release"),
      makeParams("web-release"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      workflowId: "kody.yml",
      ref: "dev",
      action: "goal-manager",
      goalId: "web-release",
    });
    expect(h.buildKodyWorkflowDispatchInputs).toHaveBeenCalledWith(
      mockOctokit,
      expect.objectContaining({
        owner: "test-owner",
        repo: "test-repo",
        ref: "dev",
        action: "goal-manager",
        message: "web-release",
      }),
    );
    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "test-owner",
      repo: "test-repo",
      workflow_id: "kody.yml",
      ref: "dev",
      inputs: {
        implementation: "goal-manager",
        message: "web-release",
      },
    });
  });

  it("returns dispatch_failed when the workflow cannot start", async () => {
    h.getUserOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({
            data: { default_branch: "dev" },
          })),
        },
        actions: {
          createWorkflowDispatch: vi.fn(async () => {
            throw new Error("workflow dispatch unavailable");
          }),
        },
      },
    });
    h.listStoredAgencyDefinitions.mockResolvedValue([
      {
        recordId: "goal:web-release:current",
        kind: "goal",
        data: { id: "web-release" },
        createdAt: "2026-07-23T00:00:00.000Z",
      },
    ]);
    h.listStoredAgencyStates.mockResolvedValue([
      {
        definitionId: "web-release",
        kind: "goal",
        data: { definitionId: "web-release", lifecycle: "active" },
      },
    ]);

    const res = await POST(
      makeRequest("web-release"),
      makeParams("web-release"),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "dispatch_failed",
      message: "workflow dispatch unavailable",
    });
  });

  it("does not dispatch an inactive Goal", async () => {
    h.getUserOctokit.mockResolvedValue({
      rest: {
        repos: { get: vi.fn() },
        actions: { createWorkflowDispatch: vi.fn() },
      },
    });
    h.listStoredAgencyDefinitions.mockResolvedValue([
      {
        recordId: "goal:web-release:current",
        kind: "goal",
        data: { id: "web-release" },
        createdAt: "2026-07-23T00:00:00.000Z",
      },
    ]);
    h.listStoredAgencyStates.mockResolvedValue([
      {
        definitionId: "web-release",
        kind: "goal",
        data: { definitionId: "web-release", lifecycle: "paused" },
      },
    ]);

    const response = await POST(
      makeRequest("web-release"),
      makeParams("web-release"),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "goal_not_active" });
  });
});
