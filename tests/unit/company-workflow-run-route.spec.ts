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

const audit = vi.hoisted(() => ({
  recordAudit: vi.fn(),
}));

const engineConfig = vi.hoisted(() => ({
  getEngineConfig: vi.fn(),
}));

const workflowFiles = vi.hoisted(() => ({
  readWorkflowDefinitionFile: vi.fn(),
  readCompanyStoreWorkflowDefinitionFile: vi.fn(),
  readCompanyStoreCapabilityWorkflowDefinitionFile: vi.fn(),
}));

const dispatch = vi.hoisted(() => ({
  buildKodyWorkflowDispatchInputs: vi.fn(
    async (_octokit: unknown, request: { action?: string }) => ({
      executable: request.action,
    }),
  ),
}));

vi.mock("@dashboard/lib/auth", () => ({
  requireKodyAuth: auth.requireKodyAuth,
  getRequestAuth: auth.getRequestAuth,
  getUserOctokit: auth.getUserOctokit,
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: githubClient.setGitHubContext,
  clearGitHubContext: githubClient.clearGitHubContext,
}));

vi.mock("@dashboard/lib/activity/audit", () => ({
  recordAudit: audit.recordAudit,
}));

vi.mock("@dashboard/lib/engine/config", () => ({
  getEngineConfig: engineConfig.getEngineConfig,
}));

vi.mock("@dashboard/lib/kody-workflow-dispatch", () => ({
  buildKodyWorkflowDispatchInputs: dispatch.buildKodyWorkflowDispatchInputs,
}));

vi.mock("@dashboard/lib/workflow-definition-files", () => ({
  readWorkflowDefinitionFile: workflowFiles.readWorkflowDefinitionFile,
  readCompanyStoreWorkflowDefinitionFile:
    workflowFiles.readCompanyStoreWorkflowDefinitionFile,
  readCompanyStoreCapabilityWorkflowDefinitionFile:
    workflowFiles.readCompanyStoreCapabilityWorkflowDefinitionFile,
}));

import { POST } from "../../app/api/kody/company/workflows/[id]/run/route";

function req(id: string): NextRequest {
  return new NextRequest(
    `https://dash.test/api/kody/company/workflows/${id}/run`,
    { method: "POST" },
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
      },
      actions: {
        createWorkflowDispatch: vi.fn(async () => ({ status: 204 })),
      },
    },
  };
}

const runnableBugWorkflow = {
  id: "bug",
  path: ".kody/capabilities/bug/profile.json",
  runnable: true,
  workflow: {
    version: 1,
    name: "bug",
    instructions: "Run the full Bug Flow.",
    capabilities: ["reproduce", "plan", "run", "review", "fix"],
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  source: "store",
  readOnly: true,
};

describe("POST /api/kody/company/workflows/:id/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        executables: { default: "run" },
        company: {
          activeCapabilities: ["bug"],
          activeWorkflows: [],
        },
      },
      sha: "config-sha",
    });
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue(null);
    workflowFiles.readCompanyStoreWorkflowDefinitionFile.mockResolvedValue(
      null,
    );
    workflowFiles.readCompanyStoreCapabilityWorkflowDefinitionFile.mockResolvedValue(
      runnableBugWorkflow,
    );
  });

  it("dispatches an active Store workflow-capability immediately", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(req("bug"), params("bug"));

    expect(res.status).toBe(200);
    expect(dispatch.buildKodyWorkflowDispatchInputs).toHaveBeenCalledWith(
      octokit,
      {
        owner: "acme",
        repo: "widgets",
        ref: "main",
        action: "bug",
      },
    );
    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      workflow_id: "kody.yml",
      ref: "main",
      inputs: { executable: "bug" },
    });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.any(NextRequest), {
      action: "workflow.run",
      resource: "bug",
      detail: "manual workflow dispatch for workflow bug",
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      workflowId: "kody.yml",
      ref: "main",
      workflow: "bug",
      action: "bug",
    });
  });

  it("rejects plain workflow definitions that are not engine-runnable capabilities", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        executables: { default: "run" },
        company: {
          activeCapabilities: [],
          activeWorkflows: [],
        },
      },
      sha: "config-sha",
    });
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue({
      path: "workflows/release/workflow.json",
      workflow: {
        version: 1,
        name: "release",
        instructions: "Release queue",
        capabilities: ["plan", "run"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      sha: "workflow-sha",
    });
    workflowFiles.readCompanyStoreCapabilityWorkflowDefinitionFile.mockResolvedValue(
      null,
    );

    const res = await POST(req("release"), params("release"));

    expect(res.status).toBe(409);
    expect(octokit.rest.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      error: "workflow_not_runnable",
    });
  });
});
