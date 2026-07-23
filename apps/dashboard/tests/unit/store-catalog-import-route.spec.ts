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

const companyStore = vi.hoisted(() => ({
  listCompanyStoreAssetSlugs: vi.fn(),
  listCompanyStoreMarkdownAssetSlugs: vi.fn(),
  companyStoreAssetPath: vi.fn(),
  readCompanyStoreText: vi.fn(),
}));

const managedGoals = vi.hoisted(() => ({
  listCompanyStoreGoalTemplateFiles: vi.fn(),
  managedGoalModel: vi.fn(),
}));

const workflowDefinitions = vi.hoisted(() => ({
  listCompanyStoreWorkflowDefinitionFiles: vi.fn(),
}));

const capabilities = vi.hoisted(() => ({
  readResolvedCapabilityFile: vi.fn(),
  readCompanyStoreCapabilityFolderFiles: vi.fn(),
}));

const engineConfig = vi.hoisted(() => ({
  getEngineConfig: vi.fn(),
  writeConfigPatch: vi.fn(),
}));

const backend = vi.hoisted(() => ({
  mutation: vi.fn(async () => null),
}));

const implementationFiles = vi.hoisted(() => ({
  listStoreImplementations: vi.fn(),
  readStoreImplementation: vi.fn(),
  readStoreImplementationBundle: vi.fn(),
  readStoreSharedAssetBundle: vi.fn(),
}));

const agencyModel = vi.hoisted(() => ({
  agencyDefinitionRecordId: vi.fn(
    (kind: string, definition: { id: string }) =>
      `${kind}:${definition.id}:revision-1`,
  ),
  applyStoredAgencyModelChange: vi.fn(),
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

vi.mock("@dashboard/lib/company-store/assets", () => ({
  listCompanyStoreAssetSlugs: companyStore.listCompanyStoreAssetSlugs,
  listCompanyStoreMarkdownAssetSlugs:
    companyStore.listCompanyStoreMarkdownAssetSlugs,
  companyStoreAssetPath: companyStore.companyStoreAssetPath,
  readCompanyStoreText: companyStore.readCompanyStoreText,
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
    workflowDefinitions.listCompanyStoreWorkflowDefinitionFiles,
}));

vi.mock("@dashboard/lib/capabilities", () => ({
  readResolvedCapabilityFile: capabilities.readResolvedCapabilityFile,
  readCompanyStoreCapabilityFolderFiles:
    capabilities.readCompanyStoreCapabilityFolderFiles,
}));

vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => backend,
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: engineConfig.getEngineConfig,
  writeConfigPatch: engineConfig.writeConfigPatch,
}));

vi.mock("@kody-ade/agency/implementations/files", () => ({
  listStoreImplementations: implementationFiles.listStoreImplementations,
  readStoreImplementation: implementationFiles.readStoreImplementation,
  readStoreImplementationBundle:
    implementationFiles.readStoreImplementationBundle,
  readStoreSharedAssetBundle:
    implementationFiles.readStoreSharedAssetBundle,
}));

vi.mock("@kody-ade/agency/backend/agency-model-store", () => ({
  agencyDefinitionRecordId: agencyModel.agencyDefinitionRecordId,
  applyStoredAgencyModelChange: agencyModel.applyStoredAgencyModelChange,
}));

import { DELETE, POST } from "../../app/api/kody/store-catalog/import/route";

function req(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/kody/store-catalog/import", {
    method,
    body: JSON.stringify(body),
  });
}

function baseConfig() {
  return {
    config: {
      defaultImplementation: "run",
      company: {
        activeAgents: [],
        activeCapabilities: [],
        activeCommands: [],
        activeGoals: [],
        activeWorkflows: [],
      },
    },
    sha: "config-sha",
  };
}

function makeOctokit() {
  return {
    repos: {
      getContent: vi.fn(),
    },
    git: {
      createTree: vi.fn(),
    },
  };
}

describe("store catalog import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyStore.listCompanyStoreMarkdownAssetSlugs.mockImplementation(
      async (_octokit: unknown, kind: string) =>
        kind === "commands" ? ["factory"] : ["atlas-agent"],
    );
    companyStore.listCompanyStoreAssetSlugs.mockImplementation(
      async (_octokit: unknown, kind: string) => {
        if (kind === "capabilities") {
          return [
            "ship-feature",
            "release-watch",
            "release-prepare",
            "release-merge",
            "vercel-production-deploy",
            "build-knowledge-graph",
            "publish-knowledge-system",
          ];
        }
        return [];
      },
    );
    companyStore.companyStoreAssetPath.mockImplementation(
      async (_octokit: unknown, kind: string, ...segments: string[]) =>
        [kind, ...segments].join("/"),
    );
    companyStore.readCompanyStoreText.mockResolvedValue("# Atlas Agent\n");
    managedGoals.listCompanyStoreGoalTemplateFiles.mockResolvedValue([
      {
        id: "weekly-quality",
        path: "todos/weekly-quality.json",
        state: {
          version: 1,
          state: "active",
          type: "improve",
          destination: { outcome: "Weekly Quality", evidence: [] },
          capabilities: ["release-watch"],
          route: [],
          facts: {},
          blockers: [],
        },
      },
      {
        id: "daily-triage",
        path: "todos/daily-triage.json",
        state: {
          version: 1,
          state: "active",
          type: "agentLoop",
          destination: { outcome: "Daily Triage", evidence: [] },
          capabilities: ["release-watch"],
          route: [],
          facts: {},
          blockers: [],
          scheduleMode: "agentLoop",
        },
      },
      {
        id: "knowledge-system-refresh",
        path: "todos/knowledge-system-refresh.json",
        state: {
          version: 1,
          state: "inactive",
          type: "agentLoop",
          destination: { outcome: "Knowledge stays current", evidence: [] },
          capabilities: [],
          route: [],
          facts: {},
          blockers: [],
          scheduleMode: "agentLoop",
          loopTarget: {
            type: "workflow",
            id: "refresh-knowledge-system",
          },
        },
      },
    ]);
    managedGoals.managedGoalModel.mockImplementation(
      (goal: { state: { scheduleMode?: string } }) =>
        goal.state.scheduleMode === "agentLoop" ? "agentLoop" : "agentGoal",
    );
    workflowDefinitions.listCompanyStoreWorkflowDefinitionFiles.mockResolvedValue(
      [
        {
          id: "release-workflow",
          workflow: {
            name: "Release Workflow",
            capabilities: ["release-watch"],
          },
        },
        {
          id: "refresh-knowledge-system",
          workflow: {
            name: "Refresh Knowledge System",
            capabilities: [
              "build-knowledge-graph",
              "publish-knowledge-system",
            ],
          },
        },
      ],
    );
    capabilities.readResolvedCapabilityFile.mockImplementation(
      async (slug: string) =>
        [
          "ship-feature",
          "release-watch",
          "build-knowledge-graph",
          "publish-knowledge-system",
        ].includes(slug)
          ? {
              slug,
              agent: slug === "release-watch" ? "atlas-agent" : null,
            }
          : null,
    );
    capabilities.readCompanyStoreCapabilityFolderFiles.mockImplementation(
      async (slug: string) => ({
        "profile.json": JSON.stringify({
          name: slug,
          implementation: slug,
        }),
        "capability.md": `# ${slug}\n`,
      }),
    );
    engineConfig.getEngineConfig.mockResolvedValue(baseConfig());
    engineConfig.writeConfigPatch.mockResolvedValue({ sha: "next-sha" });
    implementationFiles.listStoreImplementations.mockResolvedValue([]);
    implementationFiles.readStoreImplementation.mockResolvedValue(null);
    implementationFiles.readStoreImplementationBundle.mockResolvedValue({
      "definition.json": "{}\n",
      "runtime.json": "{}\n",
    });
    implementationFiles.readStoreSharedAssetBundle.mockResolvedValue(null);
    agencyModel.applyStoredAgencyModelChange.mockResolvedValue({
      created: 2,
      reused: 0,
      states: 0,
    });
  });

  it("selects an Implementation and publishes its compatible model pair", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    implementationFiles.listStoreImplementations.mockResolvedValue([
      {
        id: "release-watch-agent",
        capabilityId: "release-watch",
        compatibleCapabilityRevision: "revision-1",
        type: "agent",
        agentId: "atlas-agent",
      },
    ]);
    implementationFiles.readStoreImplementation.mockResolvedValue({
      id: "release-watch-agent",
      capabilityId: "release-watch",
      compatibleCapabilityRevision: "revision-1",
      type: "agent",
      agentId: "atlas-agent",
      htmlUrl: "https://example.test",
      definition: {
        id: "release-watch-agent",
        capabilityRef: { kind: "capability", id: "release-watch" },
        compatibleCapabilityRevision: "revision-1",
        type: "agent",
        agentRef: { kind: "agent", id: "atlas-agent" },
      },
      runtime: {},
      promptTemplate: "Run it",
      files: ["definition.json", "runtime.json"],
      assets: {
        skills: ["shared-release-review"],
        tools: [],
        scripts: [],
        hooks: [],
        commands: [],
        subagents: [],
        plugins: [],
        mcpServers: [],
        cliTools: [],
        inputMappings: [],
        outputMappings: [],
        requirements: [],
      },
    });
    implementationFiles.readStoreSharedAssetBundle.mockResolvedValue({
      "skills/shared-release-review/SKILL.md": "# Shared release review\n",
    });
    companyStore.readCompanyStoreText.mockImplementation(
      async (_octokit: unknown, path: string) =>
        path.endsWith("/definition.json")
          ? JSON.stringify({
              id: "release-watch",
              action: "release-watch",
              purpose: "Watch releases",
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
              effects: [],
              permissions: [],
              success: "Done",
              failure: "Failed",
            })
          : "# Atlas Agent\n",
    );

    const res = await POST(
      req({ kind: "implementation", slug: "release-watch-agent" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "implementation",
      slug: "release-watch-agent",
      imported: true,
      path: "execution.capabilityBindings",
    });
    expect(agencyModel.applyStoredAgencyModelChange).toHaveBeenCalledOnce();
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        kind: "implementation",
        slug: "release-watch-agent",
        source: "store",
      }),
    );
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        kind: "asset",
        slug: "skill-shared-release-review",
        source: "store",
      }),
    );
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeCapabilities: ["release-watch"],
        capabilityBindings: {
          "release-watch": "release-watch-agent",
        },
      },
      "chore(kody): select store implementation release-watch-agent",
    );
  });

  it("publishes a store agent to the backend before linking config", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(req({ kind: "agent", slug: "atlas-agent" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "agent",
      slug: "atlas-agent",
      imported: true,
      path: "company.activeAgents",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: ["atlas-agent"],
        activeCapabilities: undefined,
        activeCommands: undefined,
        activeGoals: undefined,
        activeWorkflows: undefined,
      },
      "chore(kody): add store agent atlas-agent",
    );
    expect(octokit.repos.getContent).not.toHaveBeenCalled();
    expect(octokit.git.createTree).not.toHaveBeenCalled();
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        kind: "agent",
        slug: "atlas-agent",
        bundle: {
          schemaVersion: 1,
          files: { "agent.md": "# Atlas Agent\n" },
        },
      }),
    );
  });

  it("activates a Goal target Workflow and its Capability dependencies", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(
      req({ kind: "agentLoop", slug: "knowledge-system-refresh" }),
    );

    expect(res.status).toBe(200);
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      expect.objectContaining({
        activeCapabilities: [
          "build-knowledge-graph",
          "publish-knowledge-system",
        ],
        activeGoals: ["knowledge-system-refresh"],
        activeWorkflows: ["refresh-knowledge-system"],
      }),
      "chore(kody): add store agentLoop knowledge-system-refresh",
    );
  });

  it("publishes a store capability to the backend before linking config", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(req({ kind: "capability", slug: "ship-feature" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "capability",
      slug: "ship-feature",
      imported: true,
      path: "company.activeCapabilities",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: undefined,
        activeCapabilities: ["ship-feature"],
        activeCommands: undefined,
        activeGoals: undefined,
        activeWorkflows: undefined,
      },
      "chore(kody): add store capability ship-feature",
    );
    expect(octokit.repos.getContent).not.toHaveBeenCalled();
    expect(octokit.git.createTree).not.toHaveBeenCalled();
    expect(backend.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "acme/widgets",
        kind: "capability",
        slug: "ship-feature",
      }),
    );
  });

  it("adds store goal and command types with their active capability dependencies", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    await POST(req({ kind: "agentGoal", slug: "weekly-quality" }));
    await POST(req({ kind: "agentLoop", slug: "daily-triage" }));
    await POST(req({ kind: "command", slug: "factory" }));

    expect(engineConfig.writeConfigPatch).toHaveBeenNthCalledWith(
      1,
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: ["atlas-agent"],
        activeCapabilities: ["release-watch"],
        activeCommands: undefined,
        activeGoals: ["weekly-quality"],
        activeWorkflows: undefined,
      },
      "chore(kody): add store agentGoal weekly-quality",
    );
    expect(engineConfig.writeConfigPatch).toHaveBeenNthCalledWith(
      2,
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: ["atlas-agent"],
        activeCapabilities: ["release-watch"],
        activeCommands: undefined,
        activeGoals: ["daily-triage"],
        activeWorkflows: undefined,
      },
      "chore(kody): add store agentLoop daily-triage",
    );
    expect(engineConfig.writeConfigPatch).toHaveBeenNthCalledWith(
      3,
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: undefined,
        activeCapabilities: undefined,
        activeCommands: ["factory"],
        activeGoals: undefined,
        activeWorkflows: undefined,
      },
      "chore(kody): add store command factory",
    );
  });

  it("adds a store workflow link and its capability dependencies", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(req({ kind: "workflow", slug: "release-workflow" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "workflow",
      slug: "release-workflow",
      imported: true,
      path: "company.activeWorkflows",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: ["atlas-agent"],
        activeCapabilities: ["release-watch"],
        activeCommands: undefined,
        activeGoals: undefined,
        activeWorkflows: ["release-workflow"],
      },
      "chore(kody): add store workflow release-workflow",
    );
  });

  it("imports web-release with release-prepare dependencies", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    managedGoals.listCompanyStoreGoalTemplateFiles.mockResolvedValue([
      {
        id: "web-release",
        state: {
          capabilities: [
            "release-prepare",
            "release-merge",
            "vercel-production-deploy",
          ],
        },
      },
    ]);
    capabilities.readResolvedCapabilityFile.mockImplementation(
      async (slug: string) =>
        [
          "release-prepare",
          "release-merge",
          "vercel-production-deploy",
        ].includes(slug)
          ? {
              slug,
              agent: null,
            }
          : null,
    );

    const res = await POST(req({ kind: "agentGoal", slug: "web-release" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      imported: true,
      status: "imported",
      path: "company.activeGoals",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: undefined,
        activeCapabilities: [
          "release-prepare",
          "release-merge",
          "vercel-production-deploy",
        ],
        activeCommands: undefined,
        activeGoals: ["web-release"],
        activeWorkflows: undefined,
      },
      "chore(kody): add store agentGoal web-release",
    );
  });

  it("does not rewrite config when a store item is already linked", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeAgents: ["atlas-agent"],
        },
      },
      sha: "config-sha",
    });

    const res = await POST(req({ kind: "agent", slug: "atlas-agent" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      imported: false,
      status: "already_local",
      path: "company.activeAgents",
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });

  it("does not duplicate a goal already linked by template object", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeAgents: ["atlas-agent"],
          activeCapabilities: ["release-watch"],
          activeGoals: [{ template: "weekly-quality", every: "1w" }],
          activeWorkflows: [],
        },
      },
      sha: "config-sha",
    });

    const res = await POST(req({ kind: "agentGoal", slug: "weekly-quality" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      imported: false,
      status: "already_local",
      path: "company.activeGoals",
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });

  it("adds missing dependencies when selected goal is already linked", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeGoals: [{ template: "weekly-quality", every: "1w" }],
        },
      },
      sha: "config-sha",
    });

    const res = await POST(req({ kind: "agentGoal", slug: "weekly-quality" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      imported: true,
      status: "imported",
      path: "company.activeGoals",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      {
        activeAgents: ["atlas-agent"],
        activeCapabilities: ["release-watch"],
        activeCommands: undefined,
        activeGoals: undefined,
        activeWorkflows: undefined,
      },
      "chore(kody): add store agentGoal weekly-quality",
    );
  });

  it("uses write token identity even when the browser sends an actor", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(
      req({
        kind: "agent",
        slug: "atlas-agent",
        actorLogin: "browser-user",
      }),
    );

    expect(res.status).toBe(200);
    expect(auth.verifyActorLogin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      undefined,
    );
  });

  it("rejects unknown store item kinds", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);

    const res = await POST(
      req({ kind: "skill", slug: "ship-feature" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "validation_error",
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });

  it("removes an installed store command reference", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeCommands: ["factory", "ship"],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE(
      req({ kind: "command", slug: "factory" }, "DELETE"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "command",
      slug: "factory",
      removed: true,
      status: "removed",
      path: "company.activeCommands",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      { activeCommands: ["ship"] },
      "chore(kody): remove store command factory",
    );
  });

  it("removes an installed store goal reference by template object", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeGoals: [
            { template: "weekly-quality", every: "1w" },
            "daily-triage",
          ],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE(
      req({ kind: "agentGoal", slug: "weekly-quality" }, "DELETE"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "agentGoal",
      slug: "weekly-quality",
      removed: true,
      status: "removed",
      path: "company.activeGoals",
    });
    expect(engineConfig.writeConfigPatch).toHaveBeenCalledWith(
      octokit,
      "acme",
      "widgets",
      { activeGoals: ["daily-triage"] },
      "chore(kody): remove store agentGoal weekly-quality",
    );
  });

  it("blocks removing an agent used by an installed capability", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeAgents: ["atlas-agent"],
          activeCapabilities: ["release-watch"],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE(
      req({ kind: "agent", slug: "atlas-agent" }, "DELETE"),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "store_reference_in_use",
      blockers: [{ kind: "capability", slug: "release-watch" }],
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });

  it("blocks removing a capability used by installed workflows or goals", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeCapabilities: ["release-watch"],
          activeGoals: [{ template: "weekly-quality", every: "1w" }],
          activeWorkflows: ["release-workflow"],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE(
      req({ kind: "capability", slug: "release-watch" }, "DELETE"),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "store_reference_in_use",
      blockers: expect.arrayContaining([
        {
          kind: "workflow",
          slug: "release-workflow",
          title: "Release Workflow",
        },
        {
          kind: "agentGoal",
          slug: "weekly-quality",
          title: "Weekly Quality",
        },
      ]),
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });

  it("does not rewrite config when a store reference is already missing", async () => {
    const octokit = makeOctokit();
    auth.getUserOctokit.mockResolvedValue(octokit);
    engineConfig.getEngineConfig.mockResolvedValue({
      config: {
        defaultImplementation: "run",
        company: {
          activeAgents: ["atlas-agent"],
        },
      },
      sha: "config-sha",
    });

    const res = await DELETE(req({ kind: "agent", slug: "kody" }, "DELETE"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      kind: "agent",
      slug: "kody",
      removed: false,
      status: "already_missing",
      path: "company.activeAgents",
    });
    expect(engineConfig.writeConfigPatch).not.toHaveBeenCalled();
  });
});
