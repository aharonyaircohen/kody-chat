import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(async () => null),
  getRequestAuth: vi.fn(() => ({
    token: "ghp_test",
    owner: "acme",
    repo: "widgets",
    storeRepoUrl: "aharonyaircohen/kody-store",
    storeRef: "main",
  })),
  getUserOctokit: vi.fn(),
}));

const githubClient = vi.hoisted(() => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));

const capabilities = vi.hoisted(() => ({
  listStoreCapabilityFiles: vi.fn(),
}));

const agents = vi.hoisted(() => ({
  listStoreAgentFiles: vi.fn(),
}));

const commands = vi.hoisted(() => ({
  listStoreCommandFiles: vi.fn(),
}));

const managedGoals = vi.hoisted(() => ({
  listCompanyStoreGoalTemplateFiles: vi.fn(),
  managedGoalModel: vi.fn(),
}));

const workflows = vi.hoisted(() => ({
  listCompanyStoreWorkflowDefinitionFiles: vi.fn(),
}));

function storeUrl(slug: string): string {
  return `https://github.com/acme/store/tree/main/.kody/capabilities/${slug}`;
}

vi.mock("@dashboard/lib/auth", () => ({
  requireKodyAuth: auth.requireKodyAuth,
  getRequestAuth: auth.getRequestAuth,
  getUserOctokit: auth.getUserOctokit,
}));

vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: githubClient.setGitHubContext,
  clearGitHubContext: githubClient.clearGitHubContext,
}));

vi.mock("@dashboard/lib/capabilities", () => ({
  listStoreCapabilityFiles: capabilities.listStoreCapabilityFiles,
}));

vi.mock("@dashboard/lib/agent-files", () => ({
  listStoreAgentFiles: agents.listStoreAgentFiles,
}));

vi.mock("@dashboard/lib/commands/files", () => ({
  listStoreCommandFiles: commands.listStoreCommandFiles,
}));

vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listCompanyStoreGoalTemplateFiles:
    managedGoals.listCompanyStoreGoalTemplateFiles,
}));

vi.mock("@dashboard/lib/managed-goals", () => ({
  managedGoalModel: managedGoals.managedGoalModel,
}));

vi.mock("@dashboard/lib/workflow-definition-files", () => ({
  listCompanyStoreWorkflowDefinitionFiles:
    workflows.listCompanyStoreWorkflowDefinitionFiles,
}));

import { GET } from "../../app/api/kody/store-catalog/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/kody/store-catalog");
}

describe("store catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getUserOctokit.mockResolvedValue({});
    capabilities.listStoreCapabilityFiles.mockResolvedValue([]);
    agents.listStoreAgentFiles.mockResolvedValue([]);
    commands.listStoreCommandFiles.mockResolvedValue([]);
    managedGoals.listCompanyStoreGoalTemplateFiles.mockResolvedValue([]);
    workflows.listCompanyStoreWorkflowDefinitionFiles.mockResolvedValue([]);
  });

  it("marks capability profiles with workflow steps for the Workflows tab", async () => {
    capabilities.listStoreCapabilityFiles.mockResolvedValue([
      {
        slug: "bug",
        describe: "Run the full Bug Flow.",
        htmlUrl: storeUrl("bug"),
        agent: "kody",
        every: null,
        isWorkflow: true,
        workflowSteps: ["reproduce", "plan", "run", "review", "fix"],
      },
      {
        slug: "run",
        describe: "Implement one scoped issue.",
        htmlUrl: storeUrl("run"),
        agent: "kody",
        every: null,
        isWorkflow: false,
        workflowSteps: [],
      },
    ]);

    const res = await GET(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      items: [
        {
          slug: "bug",
          kind: "capability",
          isWorkflow: true,
          workflowSteps: ["reproduce", "plan", "run", "review", "fix"],
        },
        {
          slug: "run",
          kind: "capability",
          isWorkflow: false,
          workflowSteps: [],
        },
      ],
    });
  });
});
