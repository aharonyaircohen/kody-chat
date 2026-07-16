import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_test",
    owner: "acme",
    repo: "widgets",
  })),
  getUserOctokit: vi.fn(),
  verifyActorLogin: vi.fn(async () => ({
    identity: { login: "alice", avatar_url: "u", githubId: 1 },
  })),
}));

const githubClient = vi.hoisted(() => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

const engineConfig = vi.hoisted(() => ({
  getEngineConfig: vi.fn(),
  writeConfigPatch: vi.fn(async () => ({ sha: "next-sha" })),
}));

const workflowFiles = vi.hoisted(() => ({
  listWorkflowDefinitionFiles: vi.fn(),
  listCompanyStoreWorkflowDefinitionFiles: vi.fn(),
  listCompanyStoreCapabilityWorkflowDefinitionFiles: vi.fn(),
  readWorkflowDefinitionFile: vi.fn(),
  readCompanyStoreWorkflowDefinitionFile: vi.fn(),
  readCompanyStoreCapabilityWorkflowDefinitionFile: vi.fn(),
  writeWorkflowDefinitionFile: vi.fn(),
  deleteWorkflowDefinitionFile: vi.fn(),
}));

const managedGoalFiles = vi.hoisted(() => ({
  listManagedGoalFiles: vi.fn(),
}));

const capabilityFiles = vi.hoisted(() => ({
  listLocalCapabilityFiles: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: auth.requireKodyAuth,
  getRequestAuth: auth.getRequestAuth,
  getUserOctokit: auth.getUserOctokit,
  verifyActorLogin: auth.verifyActorLogin,
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: githubClient.setGitHubContext,
  clearGitHubContext: githubClient.clearGitHubContext,
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: engineConfig.getEngineConfig,
  writeConfigPatch: engineConfig.writeConfigPatch,
}));

vi.mock("@dashboard/lib/workflow-definition-files", () => ({
  listWorkflowDefinitionFiles: workflowFiles.listWorkflowDefinitionFiles,
  listCompanyStoreWorkflowDefinitionFiles:
    workflowFiles.listCompanyStoreWorkflowDefinitionFiles,
  listCompanyStoreCapabilityWorkflowDefinitionFiles:
    workflowFiles.listCompanyStoreCapabilityWorkflowDefinitionFiles,
  readWorkflowDefinitionFile: workflowFiles.readWorkflowDefinitionFile,
  readCompanyStoreWorkflowDefinitionFile:
    workflowFiles.readCompanyStoreWorkflowDefinitionFile,
  readCompanyStoreCapabilityWorkflowDefinitionFile:
    workflowFiles.readCompanyStoreCapabilityWorkflowDefinitionFile,
  writeWorkflowDefinitionFile: workflowFiles.writeWorkflowDefinitionFile,
  deleteWorkflowDefinitionFile: workflowFiles.deleteWorkflowDefinitionFile,
}));

vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: managedGoalFiles.listManagedGoalFiles,
}));

vi.mock("@dashboard/lib/capabilities/files", () => ({
  listLocalCapabilityFiles: capabilityFiles.listLocalCapabilityFiles,
}));

import {
  GET as LIST,
  POST as CREATE,
} from "../../app/api/kody/company/workflows/route";
import {
  DELETE as DELETE_DETAIL,
  GET as GET_DETAIL,
  PATCH as PATCH_DETAIL,
} from "../../app/api/kody/company/workflows/[id]/route";

function req(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`https://dash.test${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      "x-kody-token": "ghp_test",
      "x-kody-owner": "acme",
      "x-kody-repo": "widgets",
    },
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const bugWorkflow = {
  id: "bug",
  path: ".kody/capabilities/bug/profile.json",
  workflow: {
    version: 1,
    name: "bug",
    capabilities: ["reproduce", "plan", "run", "review", "fix"],
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  updatedAt: "1970-01-01T00:00:00.000Z",
  source: "store",
  readOnly: true,
  htmlUrl:
    "https://github.com/acme/kody-store/tree/main/.kody/capabilities/bug",
};

const webReleaseWorkflow = {
  id: "web-release",
  path: ".kody/workflows/web-release/workflow.json",
  workflow: {
    version: 1,
    name: "Web release",
    capabilities: ["release-prepare", "release-merge"],
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  },
  updatedAt: "1970-01-01T00:00:00.000Z",
  source: "store",
  readOnly: true,
  htmlUrl:
    "https://github.com/acme/kody-store/tree/main/.kody/workflows/web-release",
};

function baseConfig() {
  return {
    config: {
      defaultImplementation: "run",
      company: {
        activeCapabilities: ["bug"],
        activeWorkflows: [],
      },
    },
    sha: "config-sha",
  };
}

describe("company workflows route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getUserOctokit.mockResolvedValue({ __octokit: true });
    engineConfig.getEngineConfig.mockResolvedValue(baseConfig());
    workflowFiles.listWorkflowDefinitionFiles.mockResolvedValue([]);
    managedGoalFiles.listManagedGoalFiles.mockResolvedValue([]);
    capabilityFiles.listLocalCapabilityFiles.mockResolvedValue(
      ["run", "fix", "review", "reproduce", "plan", "inspect", "verify"].map((slug) => ({ slug })),
    );
    workflowFiles.listCompanyStoreWorkflowDefinitionFiles.mockResolvedValue([]);
    workflowFiles.listCompanyStoreCapabilityWorkflowDefinitionFiles.mockResolvedValue(
      [bugWorkflow],
    );
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue(null);
    workflowFiles.readCompanyStoreWorkflowDefinitionFile.mockResolvedValue(
      null,
    );
    workflowFiles.readCompanyStoreCapabilityWorkflowDefinitionFile.mockResolvedValue(
      bugWorkflow,
    );
  });

  it("rejects an invalid user-created workflow before writing it", async () => {
    const res = await CREATE(
      req("/api/kody/company/workflows", "POST", {
        name: "Unsafe workflow",
        capabilities: ["inspect"],
        startAt: "inspect",
        steps: [
          { id: "inspect", capability: "inspect", next: [{ to: "missing" }] },
        ],
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "invalid_workflow",
    });
    expect(workflowFiles.writeWorkflowDefinitionFile).not.toHaveBeenCalled();
  });

  it("creates a valid visual workflow through the shared validation gate", async () => {
    const res = await CREATE(
      req("/api/kody/company/workflows", "POST", {
        name: "Release readiness",
        capabilities: ["inspect", "verify"],
        startAt: "inspect",
        steps: [
          { id: "inspect", capability: "inspect", next: [{ to: "verify" }] },
          { id: "verify", capability: "verify" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(workflowFiles.writeWorkflowDefinitionFile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "release-readiness",
        workflow: expect.objectContaining({
          startAt: "inspect",
          steps: expect.arrayContaining([
            expect.objectContaining({ id: "inspect" }),
            expect.objectContaining({ id: "verify" }),
          ]),
        }),
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      workflow: {
        id: "release-readiness",
        source: "local",
        readOnly: false,
      },
    });
  });

  it("rejects an invalid workflow update before writing it", async () => {
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue({
      path: "workflows/release/workflow.json",
      sha: "workflow-sha",
      workflow: {
        version: 1,
        name: "Release",
        capabilities: ["inspect", "repair"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await PATCH_DETAIL(
      req("/api/kody/company/workflows/release", "PATCH", {
        startAt: "inspect",
        steps: [
          { id: "inspect", capability: "inspect", next: [{ to: "repair" }] },
          { id: "repair", capability: "repair", next: [{ to: "inspect" }] },
        ],
      }),
      params("release"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_workflow");
    expect(workflowFiles.writeWorkflowDefinitionFile).not.toHaveBeenCalled();
  });

  it("updates a valid visual workflow through the shared validation gate", async () => {
    workflowFiles.readWorkflowDefinitionFile.mockResolvedValue({
      path: "workflows/release/workflow.json",
      sha: "workflow-sha",
      workflow: {
        version: 1,
        name: "Release",
        capabilities: ["inspect"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const res = await PATCH_DETAIL(
      req("/api/kody/company/workflows/release", "PATCH", {
        name: "Release readiness",
        capabilities: ["inspect", "verify"],
        startAt: "inspect",
        steps: [
          { id: "inspect", capability: "inspect", next: [{ to: "verify" }] },
          { id: "verify", capability: "verify" },
        ],
      }),
      params("release"),
    );

    expect(res.status).toBe(200);
    expect(workflowFiles.writeWorkflowDefinitionFile).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "release",
        workflow: expect.objectContaining({
          name: "Release readiness",
          startAt: "inspect",
        }),
      }),
    );
  });

  it("lists imported Store workflow-capabilities on the Workflows page", async () => {
    const res = await LIST(req("/api/kody/company/workflows"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      workflows: [
        {
          id: "bug",
          source: "store",
          readOnly: true,
          workflow: {
            capabilities: ["reproduce", "plan", "run", "review", "fix"],
          },
        },
      ],
    });
    const activeArg =
      workflowFiles.listCompanyStoreCapabilityWorkflowDefinitionFiles.mock
        .calls[0]![1];
    expect([...activeArg]).toEqual(["bug"]);
  });

  it("does not duplicate a Store workflow-capability when a local workflow exists", async () => {
    workflowFiles.listWorkflowDefinitionFiles.mockResolvedValue([
      {
        id: "bug",
        path: "workflows/bug/workflow.json",
        workflow: {
          version: 1,
          name: "Local bug",
          capabilities: ["run"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        source: "local",
        readOnly: false,
      },
    ]);

    const res = await LIST(req("/api/kody/company/workflows"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workflows).toHaveLength(1);
    expect(json.workflows[0]).toMatchObject({
      id: "bug",
      source: "local",
    });
  });

  it("lists Store workflows referenced by visible managed goals", async () => {
    managedGoalFiles.listManagedGoalFiles.mockResolvedValue([
      {
        id: "web-release",
        path: "todos/web-release.json",
        source: "local",
        recordType: "instance",
        state: {
          version: 1,
          state: "active",
          type: "web-release",
          sourceTemplate: "web-release",
          destination: {
            outcome: "Release is prepared and verified on production.",
            evidence: ["releasePrExists"],
          },
          workflowRef: { id: "web-release", source: "store" },
          capabilities: [],
          route: [],
          facts: {},
          blockers: [],
        },
      },
    ]);
    workflowFiles.listCompanyStoreWorkflowDefinitionFiles.mockResolvedValue([
      webReleaseWorkflow,
    ]);

    const res = await LIST(req("/api/kody/company/workflows"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      workflows: [
        {
          id: "bug",
          source: "store",
        },
        {
          id: "web-release",
          source: "store",
          workflow: {
            capabilities: ["release-prepare", "release-merge"],
          },
        },
      ],
    });
  });

  it("reads an active Store workflow-capability by id", async () => {
    const res = await GET_DETAIL(
      req("/api/kody/company/workflows/bug"),
      params("bug"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      workflow: {
        id: "bug",
        source: "store",
        workflow: {
          capabilities: ["reproduce", "plan", "run", "review", "fix"],
        },
      },
    });
  });

  it("removes an active Store workflow-capability from active capabilities", async () => {
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeCapabilities: ["bug", "review"],
          activeWorkflows: [],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE_DETAIL(
      req("/api/kody/company/workflows/bug", "DELETE"),
      params("bug"),
    );

    expect(res.status).toBe(200);
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      { __octokit: true },
      "acme",
      "widgets",
      { activeCapabilities: ["review"] },
      "chore(workflows): remove store workflow bug",
    );
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      removedStoreReference: true,
    });
  });
});
