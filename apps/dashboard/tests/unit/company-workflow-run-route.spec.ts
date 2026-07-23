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

const runner = vi.hoisted(() => ({
  runScheduledKodyOnRunner: vi.fn(async () => ({
    ok: true,
    runner: "fly",
    machineId: "m-workflow",
    ref: "main",
  })),
}));

vi.mock("@kody-ade/base/auth", () => ({
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

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: engineConfig.getEngineConfig,
}));

vi.mock("@kody-ade/fly/runners/kody-runner", () => ({
  runScheduledKodyOnRunner: runner.runScheduledKodyOnRunner,
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
        getContent: vi.fn(async () => ({
          data: {
            encoding: "base64",
            content: Buffer.from(
              "on:\n  workflow_dispatch:\n    inputs:\n      capability:\n        type: string\n",
            ).toString("base64"),
          },
        })),
      },
      actions: {
        createWorkflowDispatch: vi.fn(async () => ({ status: 204 })),
      },
    },
  };
}

const runnableBugWorkflow = {
  id: "bug",
  path: "legacy/capabilities/bug/profile.json",
  runnable: true,
  workflow: {
    version: 1,
    name: "bug",
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
        defaultImplementation: "run",
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

  it("runs an active Store workflow-capability on the shared scheduled runner", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(req("bug"), params("bug"));

    expect(res.status).toBe(200);
    expect(runner.runScheduledKodyOnRunner).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        runRequest: expect.objectContaining({
          target: { type: "workflow", id: "bug" },
          intent: "run",
        }),
      }),
    );
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.any(NextRequest), {
      action: "workflow.run",
      resource: "bug",
      detail: "manual runner dispatch for workflow bug",
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      runner: "fly",
      machineId: "m-workflow",
      ref: "main",
      workflow: "bug",
      action: "bug",
    });
  });

  it("runs a local workflow definition with a durable workflow-run id", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
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

    expect(res.status).toBe(200);
    expect(runner.runScheduledKodyOnRunner).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        runRequest: expect.objectContaining({
          target: { type: "workflow", id: "release" },
          input: expect.objectContaining({
            runId: expect.stringMatching(/^run-/),
          }),
        }),
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      workflow: "release",
      runId: expect.stringMatching(/^run-/),
    });
  });

  it("dispatches the knowledge refresh through GitHub instead of Fly", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeCapabilities: [],
          activeWorkflows: ["refresh-knowledge-system"],
        },
      },
      sha: "config-sha",
    });
    workflowFiles.readCompanyStoreWorkflowDefinitionFile.mockResolvedValue({
      id: "refresh-knowledge-system",
      path: "workflows/refresh-knowledge-system/workflow.json",
      workflow: {
        version: 1,
        name: "refresh-knowledge-system",
        capabilities: ["build-knowledge-graph"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      source: "store",
      readOnly: true,
    });

    const res = await POST(
      req("refresh-knowledge-system"),
      params("refresh-knowledge-system"),
    );

    expect(res.status).toBe(202);
    expect(runner.runScheduledKodyOnRunner).not.toHaveBeenCalled();
    expect(octokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      workflow_id: "kody.yml",
      ref: "main",
      inputs: expect.objectContaining({
        capability: "refresh-knowledge-system",
      }),
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      runner: "github",
      workflow: "refresh-knowledge-system",
      action: "refresh-knowledge-system",
    });
  });

  it("refuses to dispatch an invalid stored workflow", async () => {
    auth.getUserOctokit.mockResolvedValue(makeOctokit());
    engineConfig.getEngineConfig.mockResolvedValue({
      config: { company: { activeCapabilities: [], activeWorkflows: [] } },
      sha: "config-sha",
    });
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue({
      path: "workflows/unsafe/workflow.json",
      workflow: {
        version: 1,
        name: "unsafe",
        capabilities: ["inspect"],
        startAt: "inspect",
        steps: [
          { id: "inspect", capability: "inspect", next: [{ to: "missing" }] },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await POST(req("unsafe"), params("unsafe"));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_workflow",
      issues: [{ code: "missing_transition_target" }],
    });
    expect(runner.runScheduledKodyOnRunner).not.toHaveBeenCalled();
  });
});
