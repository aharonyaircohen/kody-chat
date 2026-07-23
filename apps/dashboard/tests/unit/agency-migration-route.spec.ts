import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writes = vi.hoisted(() => ({
  backup: vi.fn(async () => undefined),
  applyChange: vi.fn(async (_input?: {
    change: {
      definitions: Array<{
        kind: string;
        data: { id: string };
      }>;
      states: unknown[];
    };
  }) => ({
    created: 5,
    reused: 0,
    states: 3,
  })),
  implementationRevision: "",
  publishImplementation: vi.fn(async () => undefined),
}));

vi.mock("@kody-ade/base/company-store/assets", () => ({
  companyStoreAssetPath: vi.fn(
    async (_client, kind: string, id: string) => `${kind}/${id}`,
  ),
  readCompanyStoreText: vi.fn(async (_client, path: string) => {
    const id = path.split("/")[1];
    return JSON.stringify({
      id,
      action: `Run ${id}`,
      purpose: `Run ${id}`,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      effects: [],
      permissions: [],
      success: "Done",
      failure: "Failed",
    });
  }),
}));
vi.mock("@kody-ade/agency/implementations/files", () => ({
  listStoreImplementations: vi.fn(async () => [
    {
      id: "safe-deployer",
      capabilityId: "deploy",
      compatibleCapabilityRevision: writes.implementationRevision,
      type: "agent",
      agentId: "developer",
      htmlUrl: "https://example.test/safe-deployer",
    },
  ]),
  readStoreImplementation: vi.fn(async (_client, id: string) => ({
    id,
    capabilityId: "deploy",
    compatibleCapabilityRevision: writes.implementationRevision,
    type: "agent",
    agentId: "developer",
    htmlUrl: "https://example.test/safe-deployer",
    definition: {
      id,
      capabilityRef: { kind: "capability", id: "deploy" },
      compatibleCapabilityRevision: writes.implementationRevision,
      type: "agent",
      agentRef: { kind: "agent", id: "developer" },
    },
    runtime: {},
    promptTemplate: null,
    files: [],
    assets: {
      skills: [],
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
  })),
}));
vi.mock("@kody-ade/agency/implementations/publish", () => ({
  publishStoreImplementationPackage: writes.publishImplementation,
}));
vi.mock("@kody-ade/agency/routes/repo-write-access", () => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: { owner: "acme", repo: "widgets", token: "token" },
    actorLogin: "octocat",
  })),
}));
vi.mock("@kody-ade/base/auth", () => ({
  getUserOctokit: vi.fn(async () => ({})),
}));
vi.mock("@dashboard/lib/github-client", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
}));
vi.mock("@dashboard/lib/company-intents-store", () => ({
  listCompanyIntentRecords: vi.fn(async () => [
    {
      intent: {
        id: "quality",
        for: "Keep quality high",
        principles: [],
        controls: {
          automation: {
            maxConcurrentGoals: 1,
            maxDailyActions: 5,
            requiresHumanFor: [],
          },
        },
      },
    },
  ]),
}));
vi.mock("@dashboard/lib/operation-files", () => ({
  listOperationFiles: vi.fn(async () => [
    {
      operation: {
        id: "delivery",
        name: "Delivery",
        responsibility: "Ship safely",
        intentIds: ["quality"],
        goals: ["release"],
        loops: [],
      },
    },
  ]),
}));
vi.mock("@dashboard/lib/managed-goals-files", () => ({
  listManagedGoalFiles: vi.fn(async () => [
    {
      id: "release-2026-07-22",
      state: {
        id: "release-2026-07-22",
        sourceTemplate: "release",
        destination: { outcome: "Release ships", evidence: ["deployed"] },
        route: [],
        workflowRef: { id: "release-workflow" },
      },
    },
  ]),
}));
vi.mock("@dashboard/lib/managed-goals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@dashboard/lib/managed-goals")>()),
  managedGoalModel: vi.fn(() => "agentGoal"),
}));
vi.mock("@dashboard/lib/workflow-definition-files", () => ({
  listWorkflowDefinitionFiles: vi.fn(async () => [
    {
      id: "release-workflow",
      workflow: { capabilities: ["deploy"] },
    },
  ]),
  listCompanyStoreWorkflowDefinitionFiles: vi.fn(async () => []),
  readCompanyStoreWorkflowDefinitionFile: vi.fn(async () => null),
}));
vi.mock("@kody-ade/agency/capabilities", () => ({
  listCapabilityFiles: vi.fn(async () => [
    { slug: "deploy", describe: "Deploy release", landing: "comment" },
  ]),
}));
vi.mock("@dashboard/lib/backend/convex-backend", () => ({
  backendApi: { repoDocs: { save: "repoDocs.save" } },
  tenantIdFor: (owner: string, repo: string) => `${owner}/${repo}`,
  getConvexClient: () => ({ mutation: writes.backup }),
}));
vi.mock(
  "@kody-ade/agency/backend/agency-model-store",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@kody-ade/agency/backend/agency-model-store")
    >()),
    applyStoredAgencyModelChange: writes.applyChange,
  }),
);

import { GET, POST } from "../../app/api/kody/agency-migration/route";
import { agencyDefinitionRecordId } from "@kody-ade/agency/backend/agency-model-store";

beforeEach(() => {
  vi.clearAllMocks();
  const capability = {
    id: "deploy",
    action: "Run deploy",
    purpose: "Run deploy",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    effects: [],
    permissions: [],
    success: "Done",
    failure: "Failed",
  };
  writes.implementationRevision =
    agencyDefinitionRecordId("capability", capability)
      .split(":")
      .at(-1) ?? "";
});

describe("agency V2 migration route", () => {
  it("previews a complete migration without writing", async () => {
    const response = await GET(
      new NextRequest("https://dash.test/api/kody/agency-migration"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      canApply: true,
      missingCapabilities: [],
    });
    expect(writes.backup).not.toHaveBeenCalled();
    expect(writes.applyChange).not.toHaveBeenCalled();
  });

  it("backs up legacy data before writing immutable definitions", async () => {
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/agency-migration", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(201);
    expect(writes.backup).toHaveBeenCalledOnce();
    expect(writes.publishImplementation).toHaveBeenCalledWith(
      {},
      "acme/widgets",
      expect.objectContaining({ id: "safe-deployer" }),
    );
    expect(writes.applyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        change: expect.objectContaining({
          definitions: expect.any(Array),
          states: expect.any(Array),
        }),
      }),
    );
    const definitions =
      writes.applyChange.mock.calls[0]?.[0]?.change.definitions ?? [];
    expect(definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "implementation",
          data: expect.objectContaining({ id: "safe-deployer" }),
        }),
      ]),
    );
    expect(writes.backup.mock.invocationCallOrder[0]).toBeLessThan(
      writes.applyChange.mock.invocationCallOrder[0]!,
    );
  });
});
