/**
 * @fileoverview Unit tests for the goals manage endpoint
 * (app/api/kody/goals/[id]/manage/route.ts).
 * @testFramework vitest
 * @domain goals
 *
 * Tests the Convex-backed managed goal write path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getFunctionName } from "convex/server";

const convex = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = convex.query;
    mutation = convex.mutation;
  },
}));

const h = vi.hoisted(() => ({
  runScheduledKodyOnRunner: vi.fn(async () => ({
    ok: true,
    runner: "fly",
    machineId: "m-goal",
    ref: "main",
  })),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: vi.fn(async () => null),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "tester" },
  })),
  getUserOctokit: vi.fn(),
  getRequestAuth: vi.fn(() => ({
    owner: "test-owner",
    repo: "test-repo",
    token: "ghp_test-token",
  })),
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: vi.fn().mockResolvedValue({
    config: {
      defaultImplementation: "run",
      state: {
        repo: "https://github.com/test-owner/kody-state",
        path: "test-repo",
      },
    },
    sha: null,
  }),
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

vi.mock("@kody-ade/base/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@kody-ade/fly/runners/kody-runner", () => ({
  runScheduledKodyOnRunner: h.runScheduledKodyOnRunner,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auth = await import("@kody-ade/base/auth");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { getUserOctokit } = auth as any;

import { _resetConvexClient } from "@dashboard/lib/backend/convex-backend";
import { POST } from "../../app/api/kody/goals/[id]/manage/route";

beforeEach(() => {
  vi.clearAllMocks();
  _resetConvexClient();
  process.env.CONVEX_URL = "https://example.convex.cloud";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(getUserOctokit).mockResolvedValue({} as any);
});

// ---------------------------------------------------------------------------

function makeManageRequest(goalId: string, managed: boolean) {
  return new NextRequest(`https://dash.test/api/kody/goals/${goalId}/manage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kody-token": "ghp_test-token",
      "x-kody-owner": "test-owner",
      "x-kody-repo": "test-repo",
    },
    body: JSON.stringify({ managed, actorLogin: "tester" }),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function managedGoalTodoState(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    title: "capability-migration",
    description: "Migrate capability state.",
    createdAt: "2026-01-01T00:00:00.000Z",
    managed: true,
    managedModel: "agentGoal",
    state: "active",
    type: "improve",
    evidence: [],
    capabilities: [],
    route: [],
    facts: {},
    blockers: [],
    items: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("POST /api/kody/goals/[id]/manage", () => {
  it("writes managed state to the Convex backend", async () => {
    convex.query.mockResolvedValue(null);
    convex.mutation.mockResolvedValue("id-1");

    const req = makeManageRequest("capability-migration", true);
    const res = await POST(req, makeParams("capability-migration"));

    expect(res.status).toBe(200);
    const saveCall = convex.mutation.mock.calls.find(
      ([ref]) => getFunctionName(ref) === "goals:save",
    );
    expect(saveCall).toBeDefined();
    expect(saveCall![1]).toMatchObject({
      tenantId: "test-owner/test-repo",
      goalId: "capability-migration",
    });

    // The dispatch must pass the goal as the explicit target, not as an issue.
    expect(h.runScheduledKodyOnRunner).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        runRequest: expect.objectContaining({
          target: { type: "goal", id: "capability-migration" },
          intent: "manage",
        }),
      }),
    );
  });

  it("updates existing managed state", async () => {
    convex.query.mockResolvedValue({
      goalId: "capability-migration",
      state: managedGoalTodoState({
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    convex.mutation.mockResolvedValue("id-1");

    const req = makeManageRequest("capability-migration", false);
    const res = await POST(req, makeParams("capability-migration"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state?.managed).toBe(false);
    const saveCall = convex.mutation.mock.calls.find(
      ([ref]) => getFunctionName(ref) === "goals:save",
    );
    expect(saveCall).toBeDefined();
  });

  it("returns 409 when trying to unmanage a goal that has no prior state", async () => {
    convex.query.mockResolvedValue(null);

    const req = makeManageRequest("brand-new-goal", false);
    const res = await POST(req, makeParams("brand-new-goal"));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("goal_not_started");
    expect(convex.mutation).not.toHaveBeenCalled();
  });
});
