import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    owner: "acme",
    repo: "widgets",
    token: "token",
  })),
  verifyActorLogin: vi.fn(async () => ({ actorLogin: "octocat" })),
  getUserOctokit: vi.fn(async () => ({ rest: {} })),
}));
vi.mock("@kody-ade/base/auth", () => auth);

const manager = vi.hoisted(() => ({
  submitAgencyRequest: vi.fn(
    async (
      _input?: unknown,
      _ports?: { resolveBlueprint(id: string): Promise<unknown> },
    ) => ({
      created: true,
      todoSlug: "set-up-ci-repair",
      handoff: { message: "Assess todo set-up-ci-repair" },
    }),
  ),
}));
vi.mock("@kody-ade/agency/agency-request-manager", () => manager);

const todos = vi.hoisted(() => ({
  createTodoSlug: vi.fn(async () => "set-up-ci-repair"),
  listTodoFiles: vi.fn(async () => []),
  writeTodoFile: vi.fn(async () => ({ slug: "set-up-ci-repair" })),
}));
vi.mock("@kody-ade/workspace/todos/files", () => todos);

const github = vi.hoisted(() => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));
vi.mock("@kody-ade/workspace/github", () => github);

const strategies = vi.hoisted(() => ({
  readStoreStrategy: vi.fn(async () => ({
    blueprint: { id: "healthy-ci" },
    instructions: "Build native CI",
  })),
}));
vi.mock("@dashboard/lib/store-strategies", () => strategies);

import { POST } from "../../app/api/kody/agency-requests/route";

function request(body: unknown) {
  return new NextRequest("https://dash.test/api/kody/agency-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  source: {
    kind: "guided-flow",
    instanceId: "flow-instance-1",
    effectId: "flow-instance-1:complete",
  },
  answers: {
    desiredOutcome: "Keep CI passing",
    activation: "A failed GitHub Actions run",
    allowedActions: "Create a repair branch and pull request",
    successCriteria: "The failed checks pass",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  manager.submitAgencyRequest.mockResolvedValue({
    created: true,
    todoSlug: "set-up-ci-repair",
    handoff: { message: "Assess todo set-up-ci-repair" },
  });
});

describe("agency request route", () => {
  it("submits a repository-scoped request and clears its context", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    expect(github.setGitHubContext).toHaveBeenCalledWith(
      "acme",
      "widgets",
      "token",
      undefined,
      undefined,
    );
    expect(manager.submitAgencyRequest).toHaveBeenCalledWith(
      validBody,
      expect.objectContaining({
        findBySource: expect.any(Function),
        create: expect.any(Function),
      }),
    );
    expect(github.clearGitHubContext).toHaveBeenCalledOnce();
  });

  it("passes the selected Blueprint to the request owner", async () => {
    const body = { ...validBody, blueprintId: "healthy-ci" };
    const response = await POST(request(body));

    expect(response.status).toBe(201);
    const ports = manager.submitAgencyRequest.mock.calls[0]![1]!;
    await expect(ports.resolveBlueprint("healthy-ci")).resolves.toMatchObject({
      blueprint: { id: "healthy-ci" },
    });
    expect(strategies.readStoreStrategy).toHaveBeenCalledWith(
      expect.anything(),
      "healthy-ci",
    );
  });

  it("rejects incomplete request data before creating anything", async () => {
    const response = await POST(request({ answers: {} }));

    expect(response.status).toBe(400);
    expect(manager.submitAgencyRequest).not.toHaveBeenCalled();
  });

  it("does not expose internal failure details", async () => {
    manager.submitAgencyRequest.mockRejectedValue(
      new Error("secret provider response"),
    );

    const response = await POST(request(validBody));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "agency_request_submit_failed" });
    expect(JSON.stringify(payload)).not.toContain("secret provider response");
  });
});
