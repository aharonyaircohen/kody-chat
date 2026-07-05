/**
 * @fileoverview Unit coverage for Fly request context resolution.
 * @testFramework vitest
 * @domain runner
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  getRequestAuth: vi.fn(),
  getUserOctokit: vi.fn(),
  resolveActorFromToken: vi.fn(),
}));

const vault = vi.hoisted(() => ({
  readVault: vi.fn(),
}));

const engineConfig = vi.hoisted(() => ({
  getEngineConfig: vi.fn(),
}));

const chatModels = vi.hoisted(() => ({
  loadChatModels: vi.fn(),
}));

vi.mock("@dashboard/lib/auth", () => auth);
vi.mock("@dashboard/lib/vault/store", () => vault);
vi.mock("@dashboard/lib/engine/config", () => engineConfig);
vi.mock("@dashboard/lib/variables/load-chat-models", () => chatModels);
vi.mock("@dashboard/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function request(): NextRequest {
  return new NextRequest("https://dash.test/api/kody/fly/machines", {
    headers: {
      "x-kody-token": "ghp_user",
      "x-kody-owner": "A-Guy-educ",
      "x-kody-repo": "A-Guy-Web",
    },
  });
}

function mockVaultSecrets(secrets: Record<string, string>) {
  vault.readVault.mockResolvedValue({
    doc: {
      secrets: Object.fromEntries(
        Object.entries(secrets).map(([name, value]) => [name, { value }]),
      ),
    },
  });
}

describe("resolveFlyContext", () => {
  const originalFlyApiToken = process.env.FLY_API_TOKEN;
  const originalFlyIoToken = process.env.FLY_IO_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FLY_API_TOKEN = "";
    process.env.FLY_IO_TOKEN = "";
    auth.getRequestAuth.mockReturnValue({
      token: "ghp_user",
      owner: "A-Guy-educ",
      repo: "A-Guy-Web",
    });
    auth.getUserOctokit.mockResolvedValue({ rest: {} });
    auth.resolveActorFromToken.mockResolvedValue({
      login: "aguyaharonyair",
    });
    engineConfig.getEngineConfig.mockResolvedValue({ config: {} });
    chatModels.loadChatModels.mockResolvedValue([]);
    mockVaultSecrets({
      FLY_API_TOKEN: "vault-fly-token",
      FLY_ORG_SLUG: "aharon-yair-cohen",
      FLY_DEFAULT_REGION: "fra",
      MODEL_API_KEY: "model-token",
    });
  });

  afterEach(() => {
    process.env.FLY_API_TOKEN = originalFlyApiToken;
    process.env.FLY_IO_TOKEN = originalFlyIoToken;
  });

  it("uses the environment Fly token before the repo vault token", async () => {
    process.env.FLY_API_TOKEN = "env-fly-token";
    const { resolveFlyContext } = await import(
      "@dashboard/lib/runners/fly-context"
    );

    const resolved = await resolveFlyContext(request());

    expect(resolved).toMatchObject({
      ok: true,
      context: {
        account: "aguyaharonyair",
        flyToken: "env-fly-token",
        flyOrgSlug: "aharon-yair-cohen",
        flyDefaultRegion: "fra",
        allSecrets: { MODEL_API_KEY: "model-token" },
      },
    });
  });

  it("falls back to the repo vault Fly token when no environment token exists", async () => {
    const { resolveFlyContext } = await import(
      "@dashboard/lib/runners/fly-context"
    );

    const resolved = await resolveFlyContext(request());

    expect(resolved).toMatchObject({
      ok: true,
      context: {
        flyToken: "vault-fly-token",
      },
    });
  });
});
