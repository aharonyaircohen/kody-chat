import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getEngineConfig: vi.fn(async () => ({
    config: {
      execution: { capabilityBindings: { existing: "existing-runner" } },
    },
  })),
  writeConfigPatch: vi.fn(async () => ({ sha: "next" })),
  listStoredAgencyDefinitions: vi.fn(),
  getOctokit: vi.fn(() => ({ rest: {} })),
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: h.getEngineConfig,
  writeConfigPatch: h.writeConfigPatch,
}));
vi.mock("@kody-ade/base/activity/audit", () => ({
  recordAudit: vi.fn(),
}));
vi.mock("../src/backend/agency-model-store", () => ({
  listStoredAgencyDefinitions: h.listStoredAgencyDefinitions,
}));
vi.mock("../src/github", () => ({
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
  getOctokit: h.getOctokit,
}));
vi.mock("../src/routes/repo-write-access", () => ({
  verifyRepoWriteAccess: vi.fn(async () => ({
    auth: { owner: "acme", repo: "widgets", token: "token" },
    actorLogin: "octocat",
  })),
}));

import { PUT } from "../src/routes/capability-implementation-binding";

beforeEach(() => {
  vi.clearAllMocks();
  h.listStoredAgencyDefinitions.mockResolvedValue([
    {
      recordId: "capability:build-graph:revision",
      kind: "capability",
      schemaVersion: 1,
      data: { id: "build-graph" },
      createdAt: "2026-07-23T00:00:00.000Z",
    },
    {
      recordId: "implementation:graphify:revision",
      kind: "implementation",
      schemaVersion: 1,
      data: {
        id: "graphify",
        capabilityRef: { kind: "capability", id: "build-graph" },
        compatibleCapabilityRevision: "revision",
        type: "script",
      },
      createdAt: "2026-07-23T00:00:00.000Z",
    },
  ]);
});

describe("Capability Implementation binding route", () => {
  it("persists a compatible repository binding without changing the Capability", async () => {
    const response = await PUT(
      new NextRequest(
        "https://dash.test/api/kody/capabilities/build-graph/implementation-binding",
        {
          method: "PUT",
          body: JSON.stringify({ implementationId: "graphify" }),
        },
      ),
      { params: Promise.resolve({ slug: "build-graph" }) },
    );

    expect(response.status).toBe(200);
    expect(h.writeConfigPatch).toHaveBeenCalledWith(
      expect.anything(),
      "acme",
      "widgets",
      {
        capabilityBindings: {
          existing: "existing-runner",
          "build-graph": "graphify",
        },
      },
      "Configure build-graph implementation",
    );
  });
});
