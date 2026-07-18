/**
 * @fileoverview Unit tests for capability API routes.
 * @testFramework vitest
 * @domain capabilities
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireKodyAuth: vi.fn(),
  verifyActorLogin: vi.fn(),
  getUserOctokit: vi.fn(),
  getRequestAuth: vi.fn(),
  setGitHubContext: vi.fn(),
  clearGitHubContext: vi.fn(),
  listCapabilityFiles: vi.fn(),
  readCapabilityFile: vi.fn(),
  readResolvedCapabilityFile: vi.fn(),
  writeCapabilityFile: vi.fn(),
  deleteCapabilityFile: vi.fn(),
  resolveInstalledCapabilitySlugs: vi.fn(),
  getEngineConfig: vi.fn(),
  writeConfigPatch: vi.fn(),
  getProjectedEngineConfig: vi.fn(),
  listProjectedCapabilities: vi.fn(),
  getProjectedCapability: vi.fn(),
  saveProjectedCapability: vi.fn(),
  recordAudit: vi.fn(),
  backendQuery: vi.fn(),
  backendMutation: vi.fn(),
}));

vi.mock("@kody-ade/base/auth", () => ({
  requireKodyAuth: h.requireKodyAuth,
  verifyActorLogin: h.verifyActorLogin,
  getUserOctokit: h.getUserOctokit,
  getRequestAuth: h.getRequestAuth,
}));

vi.mock("@kody-ade/agency/github", () => ({
  setGitHubContext: h.setGitHubContext,
  clearGitHubContext: h.clearGitHubContext,
}));

vi.mock("@kody-ade/agency/capabilities", () => ({
  listCapabilityFiles: h.listCapabilityFiles,
  readCapabilityFile: h.readCapabilityFile,
  readResolvedCapabilityFile: h.readResolvedCapabilityFile,
  writeCapabilityFile: h.writeCapabilityFile,
  deleteCapabilityFile: h.deleteCapabilityFile,
  isValidSlug: (slug: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug),
  PERMISSION_MODES: ["default", "acceptEdits", "plan", "bypassPermissions"],
}));

vi.mock("@kody-ade/base/engine/config", () => ({
  getEngineConfig: h.getEngineConfig,
  writeConfigPatch: h.writeConfigPatch,
}));

vi.mock("@dashboard/lib/company-store/installed-capabilities", () => ({
  resolveInstalledCapabilitySlugs: h.resolveInstalledCapabilitySlugs,
}));

vi.mock("@dashboard/lib/backend/repo-projection", () => ({
  getProjectedEngineConfig: h.getProjectedEngineConfig,
  listProjectedCapabilities: h.listProjectedCapabilities,
  getProjectedCapability: h.getProjectedCapability,
  saveProjectedCapability: h.saveProjectedCapability,
}));

vi.mock("@kody-ade/base/activity/audit", () => ({
  recordAudit: h.recordAudit,
}));
vi.mock("@kody-ade/backend/api", () => ({
  api: {
    catalog: {
      get: "catalog:get",
      remove: "catalog:remove",
      save: "catalog:save",
    },
  },
}));
vi.mock("@kody-ade/backend/client", () => ({
  createBackendClient: () => ({
    query: h.backendQuery,
    mutation: h.backendMutation,
  }),
}));

import { GET, POST } from "../../app/api/kody/capabilities/route";
import { DELETE, PATCH } from "../../app/api/kody/capabilities/[slug]/route";

function authHeaders() {
  return {
    "x-kody-token": "ghp_test-token",
    "x-kody-owner": "acme",
    "x-kody-repo": "widgets",
  };
}

function request(
  url: string,
  init: { method?: string; body?: BodyInit | null; headers?: HeadersInit } = {},
) {
  return new NextRequest(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

function params(slug = "ship-feature") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/kody/capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireKodyAuth.mockResolvedValue(null);
    h.verifyActorLogin.mockResolvedValue({ identity: { login: "alice" } });
    h.getRequestAuth.mockReturnValue({
      token: "ghp_test-token",
      owner: "acme",
      repo: "widgets",
      storeRepoUrl: "https://github.com/acme/kody-store",
      storeRef: "stable",
    });
    h.getUserOctokit.mockResolvedValue({ rest: {} });
    h.getProjectedCapability.mockResolvedValue(null);
    h.saveProjectedCapability.mockResolvedValue(undefined);
    h.getEngineConfig.mockResolvedValue({
      config: {
        company: {
          activeCapabilities: ["store-on"],
        },
      },
      sha: "config-sha",
    });
    h.resolveInstalledCapabilitySlugs.mockResolvedValue(new Set(["store-on"]));
    h.getProjectedEngineConfig.mockResolvedValue({
      config: { company: { activeCapabilities: ["store-on"] } },
      sha: null,
    });
    h.listProjectedCapabilities.mockResolvedValue([
      { slug: "local-one", source: "local" },
      { slug: "store-on", source: "store" },
    ]);
  });

  it("lists local capabilities and active Store capabilities only", async () => {
    const res = await GET(request("https://dash.test/api/kody/capabilities"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(
      json.capabilities.map((entry: { slug: string }) => entry.slug),
    ).toEqual(["local-one", "store-on"]);
    expect(json.implementations).toBeUndefined();
    expect(h.listProjectedCapabilities).toHaveBeenCalled();
  });
});

describe("POST /api/kody/capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireKodyAuth.mockResolvedValue(null);
    h.verifyActorLogin.mockResolvedValue({ identity: { login: "alice" } });
    h.getRequestAuth.mockReturnValue({
      token: "ghp_test-token",
      owner: "acme",
      repo: "widgets",
      storeRepoUrl: "https://github.com/acme/kody-store",
      storeRef: "stable",
    });
    h.getUserOctokit.mockResolvedValue({ rest: {} });
    h.readCapabilityFile.mockResolvedValue(null);
    h.writeCapabilityFile.mockResolvedValue({
      slug: "ship-feature",
      describe: "Ship feature",
    });
  });

  it("creates capability files through the capability storage helper", async () => {
    const res = await POST(
      request("https://dash.test/api/kody/capabilities", {
        method: "POST",
        body: JSON.stringify({
          slug: "ship-feature",
          instructions: "Ship the feature.",
          tools: ["Read"],
          skills: [],
          shellScripts: [],
          mcpServers: [],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ capability: { slug: "ship-feature" } });
    expect(json).not.toHaveProperty("implementation");
    expect(h.writeCapabilityFile).toHaveBeenCalledWith(
      expect.objectContaining({
        octokit: { rest: {} },
        fields: expect.objectContaining({
          slug: "ship-feature",
          prompt: "Ship the feature.",
        }),
      }),
    );
    expect(h.saveProjectedCapability).toHaveBeenCalledWith(
      "acme",
      "widgets",
      expect.objectContaining({
        slug: "ship-feature",
        prompt: "Ship the feature.",
      }),
    );
    expect(h.recordAudit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        action: "capability.create",
        resource: "ship-feature",
      }),
    );
  });
});

describe("DELETE /api/kody/capabilities/[slug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireKodyAuth.mockResolvedValue(null);
    h.verifyActorLogin.mockResolvedValue({ identity: { login: "alice" } });
    h.getRequestAuth.mockReturnValue({
      token: "ghp_test-token",
      owner: "acme",
      repo: "widgets",
      storeRepoUrl: "https://github.com/acme/kody-store",
      storeRef: "stable",
    });
    h.getUserOctokit.mockResolvedValue({ rest: {} });
  });

  it("deletes the Convex capability projection", async () => {
    h.backendQuery.mockResolvedValue({ doc: { slug: "ship-feature" } });
    h.backendMutation.mockResolvedValue(undefined);
    h.getProjectedCapability.mockResolvedValue({
      slug: "ship-feature",
      describe: "Ship feature",
    });

    const res = await DELETE(
      request(
        "https://dash.test/api/kody/capabilities/ship-feature?actorLogin=alice",
        { method: "DELETE" },
      ),
      params(),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(h.backendMutation).toHaveBeenCalled();
    expect(h.deleteCapabilityFile).toHaveBeenCalledWith(
      { rest: {} },
      "ship-feature",
    );
    expect(h.writeConfigPatch).not.toHaveBeenCalled();
    expect(h.recordAudit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        action: "capability.delete",
        resource: "ship-feature",
      }),
    );
  });

  it("updates the engine definition and Convex projection together", async () => {
    h.backendQuery.mockResolvedValue({
      doc: {
        slug: "ship-feature",
        describe: "Ship feature",
        prompt: "Old instructions",
        model: "inherit",
        permissionMode: "acceptEdits",
        tools: [],
        skills: [],
        shellScripts: [],
        mcpServers: [],
        landing: "pr",
      },
    });
    h.writeCapabilityFile.mockResolvedValue({
      slug: "ship-feature",
      describe: "Ship feature",
      prompt: "New instructions",
      model: "inherit",
      permissionMode: "acceptEdits",
      tools: [],
      skills: [],
      shellScripts: [],
      mcpServers: [],
      landing: "pr",
      updatedAt: "2026-07-18T00:00:00.000Z",
    });

    const res = await PATCH(
      request("https://dash.test/api/kody/capabilities/ship-feature", {
        method: "PATCH",
        body: JSON.stringify({
          instructions: "New instructions",
          actorLogin: "alice",
        }),
      }),
      params(),
    );

    expect(res.status).toBe(200);
    expect(h.writeCapabilityFile).toHaveBeenCalled();
    expect(h.backendMutation).toHaveBeenCalled();
  });
});
