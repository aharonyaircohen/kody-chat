import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_test",
    owner: "acme",
    repo: "widgets",
    storeRepoUrl: "https://github.com/acme/kody-store",
    storeRef: "main",
  })),
  getUserOctokit: vi.fn(),
}));
const githubClient = vi.hoisted(() => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const engineConfig = vi.hoisted(() => ({ getEngineConfig: vi.fn() }));
const workflowFiles = vi.hoisted(() => ({
  readWorkflowDefinitionFile: vi.fn(),
  readCompanyStoreWorkflowDefinitionFile: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => auth);
vi.mock("@dashboard/lib/github-client", () => githubClient);
vi.mock("@dashboard/lib/activity/audit", () => audit);
vi.mock("@dashboard/lib/cto/trust-store", () => ({
  readTrust: vi.fn(async () => ({ capabilities: {}, subjects: {}, log: [] })),
}));
vi.mock("@kody-ade/base/engine/config", () => engineConfig);
vi.mock("@dashboard/lib/workflow-definition-files", () => workflowFiles);

import { POST } from "../../app/api/kody/company/workflows/[id]/run/route";

function request(id: string, body?: unknown): NextRequest {
  return new NextRequest(
    `https://dash.test/api/kody/company/workflows/${id}/run`,
    {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeOctokit() {
  return {
    rest: {
      repos: {
        get: vi.fn(async () => ({ data: { default_branch: "main" } })),
        getContent: vi.fn(async () => ({
          data: {
            encoding: "base64",
            content: Buffer.from(
              "on:\n  workflow_dispatch:\n    inputs:\n      runRequest:\n        type: string\n",
            ).toString("base64"),
          },
        })),
      },
      actions: {
        createWorkflowDispatch: vi.fn(async (_input: unknown) => ({
          status: 204,
        })),
      },
    },
  };
}

const validWorkflow = {
  id: "learn-from-runs",
  path: "catalog/workflows/learn-from-runs/workflow.json",
  runnable: true,
  workflow: {
    name: "Learn from Runs",
    agent: "memory-steward",
    capabilities: ["extract-run-learning"],
  },
  source: "store",
  readOnly: true,
};

describe("POST /api/kody/company/workflows/:id/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        company: { activeWorkflows: ["learn-from-runs"] },
      },
      sha: "config-sha",
    });
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue(null);
    workflowFiles.readCompanyStoreWorkflowDefinitionFile.mockResolvedValue(
      validWorkflow,
    );
  });

  it("dispatches every Workflow through the provider-neutral Engine request", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const response = await POST(
      request("learn-from-runs", { approved: true }),
      params("learn-from-runs"),
    );

    expect(response.status).toBe(202);
    const dispatch = octokit.rest.actions.createWorkflowDispatch.mock
      .calls[0]![0] as {
      inputs: { runRequest: string };
    };
    expect(dispatch).toMatchObject({
      owner: "acme",
      repo: "widgets",
      workflow_id: "kody.yml",
      ref: "main",
    });
    expect(JSON.parse(dispatch.inputs.runRequest)).toEqual({
      requestId: expect.stringMatching(/^run-/),
      target: { type: "workflow", id: "learn-from-runs" },
      intent: "run",
      source: "dashboard",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      execution: "kody-engine",
      workflow: "learn-from-runs",
      runId: expect.stringMatching(/^run-/),
    });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.any(NextRequest), {
      action: "workflow.run",
      resource: "learn-from-runs",
      detail: "manual Engine dispatch for workflow learn-from-runs",
    });
  });

  it("preserves the workflow run id when resuming", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    await POST(
      request("learn-from-runs", {
        mode: "resume",
        runId: "run-existing",
        approved: true,
      }),
      params("learn-from-runs"),
    );

    const dispatch = octokit.rest.actions.createWorkflowDispatch.mock
      .calls[0]![0] as {
      inputs: { runRequest: string };
    };
    expect(JSON.parse(dispatch.inputs.runRequest)).toMatchObject({
      requestId: "run-existing",
    });
  });

  it("rejects invalid workflows before dispatch", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    workflowFiles.readCompanyStoreWorkflowDefinitionFile.mockResolvedValue({
      ...validWorkflow,
      workflow: {
        ...validWorkflow.workflow,
        startAt: "extract",
        steps: [
          {
            id: "extract",
            capability: "extract-run-learning",
            next: [{ to: "missing" }],
          },
        ],
      },
    });

    const response = await POST(
      request("learn-from-runs"),
      params("learn-from-runs"),
    );

    expect(response.status).toBe(409);
    expect(octokit.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
  });

  it("requires explicit approval before dispatching an untrusted Workflow", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const response = await POST(
      request("learn-from-runs"),
      params("learn-from-runs"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "approval_required",
    });
    expect(octokit.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
  });
});
