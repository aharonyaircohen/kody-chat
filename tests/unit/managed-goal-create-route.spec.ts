/** @fileoverview Unit tests for managed goal creation route. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  readManagedGoalFile: vi.fn(),
  writeManagedGoalFile: vi.fn(),
  getUserOctokit: vi.fn(),
}));

vi.mock("@dashboard/lib/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "tester" },
  })),
  getUserOctokit: h.getUserOctokit,
  getRequestAuth: vi.fn(() => ({
    owner: "test-owner",
    repo: "test-repo",
    token: "ghp_test-token",
  })),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: vi.fn(async () => []),
  listCompanyStoreGoalTemplateFiles: vi.fn(async () => []),
  readManagedGoalFile: h.readManagedGoalFile,
  writeManagedGoalFile: h.writeManagedGoalFile,
}));

import { POST } from "../../app/api/kody/goals/managed/route";

function createRequest(body: unknown) {
  return new NextRequest("https://dash.test/api/kody/goals/managed", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kody-token": "ghp_test-token",
      "x-kody-owner": "test-owner",
      "x-kody-repo": "test-repo",
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/kody/goals/managed", () => {
  it("creates a goal with the user-managed route order", async () => {
    h.readManagedGoalFile.mockResolvedValue(null);
    h.writeManagedGoalFile.mockResolvedValue(undefined);
    h.getUserOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({ data: { default_branch: "main" } })),
        },
        actions: {
          createWorkflowDispatch: vi.fn(async () => undefined),
        },
      },
    });

    const route = [
      {
        stage: "review",
        evidence: "changeVerified",
        agentResponsibility: "review",
        agentAction: "review",
      },
      {
        stage: "implement",
        evidence: "changeImplemented",
        agentResponsibility: "fix",
        agentAction: "fix",
      },
    ];

    const res = await POST(
      createRequest({
        type: "improve",
        schedule: "manual",
        outcome: "Goal creation works from the dashboard.",
        evidence: ["changeVerified", "changeImplemented"],
        agentResponsibilities: ["review", "fix"],
        route,
      }),
    );

    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.error).toBeUndefined();
    expect(h.writeManagedGoalFile).toHaveBeenCalledTimes(1);
    const write = h.writeManagedGoalFile.mock.calls[0]![0];
    expect(write.id).toBe("goal-creation-works-from-the-dashboard");
    expect(write.state.destination.evidence).toEqual([
      "changeVerified",
      "changeImplemented",
    ]);
    expect(write.state.route).toEqual(route);
    expect(write.state.stage).toBe("review");
  });

  it("creates a route-free agentLoop", async () => {
    h.readManagedGoalFile.mockResolvedValue(null);
    h.writeManagedGoalFile.mockResolvedValue(undefined);
    h.getUserOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn(async () => ({ data: { default_branch: "main" } })),
        },
        actions: {
          createWorkflowDispatch: vi.fn(async () => undefined),
        },
      },
    });

    const res = await POST(
      createRequest({
        type: "agentLoop",
        schedule: "1d",
        outcome: "Keep codebase healthy report drift.",
        evidence: [],
        agentResponsibilities: ["code-health", "docs-health"],
        route: [],
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.error).toBeUndefined();
    expect(h.writeManagedGoalFile).toHaveBeenCalledTimes(1);
    const write = h.writeManagedGoalFile.mock.calls[0]![0];
    expect(write.id).toBe("keep-codebase-healthy-report-drift");
    expect(write.state).toMatchObject({
      type: "agentLoop",
      schedule: "1d",
      scheduleMode: "agentLoop",
      destination: {
        outcome: "Keep codebase healthy report drift.",
        evidence: [],
      },
      agentResponsibilities: ["code-health", "docs-health"],
      route: [],
      facts: { goalType: "agentLoop" },
    });
  });
});
