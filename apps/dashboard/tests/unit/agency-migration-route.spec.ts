import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const writes = vi.hoisted(() => ({
  backup: vi.fn(async () => undefined),
  create: vi.fn(async () => undefined),
  putState: vi.fn(async () => undefined),
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
        controls: { automation: { maxConcurrentGoals: 1, maxDailyActions: 5, requiresHumanFor: [] } },
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
      id: "release",
      state: {
        destination: { outcome: "Release ships", evidence: ["deployed"] },
        route: [],
        workflowRef: { id: "release-workflow" },
      },
    },
  ]),
}));
vi.mock("@dashboard/lib/managed-goals", () => ({
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
vi.mock("@kody-ade/agency/backend/agency-model-store", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@kody-ade/agency/backend/agency-model-store")
  >()),
  createStoredAgencyDefinition: writes.create,
  putStoredAgencyState: writes.putState,
}));

import { GET, POST } from "../../app/api/kody/agency-migration/route";

beforeEach(() => vi.clearAllMocks());

describe("agency V2 migration route", () => {
  it("previews a complete migration without writing", async () => {
    const response = await GET(
      new NextRequest("https://dash.test/api/kody/agency-migration"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canApply: true, missingCapabilities: [] });
    expect(writes.backup).not.toHaveBeenCalled();
    expect(writes.create).not.toHaveBeenCalled();
  });

  it("backs up legacy data before writing immutable definitions", async () => {
    const response = await POST(
      new NextRequest("https://dash.test/api/kody/agency-migration", { method: "POST" }),
    );
    expect(response.status).toBe(201);
    expect(writes.backup).toHaveBeenCalledOnce();
    expect(writes.create).toHaveBeenCalled();
    expect(writes.putState).toHaveBeenCalled();
    expect(writes.backup.mock.invocationCallOrder[0]).toBeLessThan(
      writes.create.mock.invocationCallOrder[0]!,
    );
  });
});
