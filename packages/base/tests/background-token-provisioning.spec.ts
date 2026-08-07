import { beforeEach, describe, expect, it, vi } from "vitest";

const vault = vi.hoisted(() => ({
  configured: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  invalidate: vi.fn(),
  resetBackgroundCache: vi.fn(),
}));

vi.mock("../src/vault/crypto", () => ({
  isVaultConfigured: vault.configured,
}));

vi.mock("../src/vault/store", () => ({
  readVault: vault.read,
  writeVault: vault.write,
  invalidateVaultCache: vault.invalidate,
}));

vi.mock("../src/vault/bootstrap", () => ({
  _resetBackgroundCredentialCache: vault.resetBackgroundCache,
}));

import { MANAGED_BACKGROUND_GITHUB_TOKEN } from "../src/auth/background-token-contract";
import { provisionBackgroundGitHubAccess } from "../src/auth/background-token-provisioning";

describe("managed background GitHub access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vault.configured.mockReturnValue(true);
    vault.read.mockResolvedValue({
      doc: { version: 1, secrets: {} },
      sha: null,
    });
    vault.write.mockResolvedValue({ sha: "next" });
  });

  it("stores the verified PAT under a Kody-owned vault key", async () => {
    const result = await provisionBackgroundGitHubAccess({
      octokit: {} as never,
      owner: "acme",
      repo: "widgets",
      token: "github_pat_verified",
      actorLogin: "alice",
      now: "2026-08-06T00:00:00.000Z",
    });

    expect(result).toEqual({ ok: true, source: "managed-vault" });
    expect(vault.write).toHaveBeenCalledWith(
      {},
      "acme",
      "widgets",
      {
        version: 1,
        secrets: {
          [MANAGED_BACKGROUND_GITHUB_TOKEN]: {
            value: "github_pat_verified",
            updatedAt: "2026-08-06T00:00:00.000Z",
            updatedBy: "alice",
          },
        },
      },
      null,
      "chore(vault): update Kody background GitHub access",
    );
    expect(vault.invalidate).toHaveBeenCalledWith("acme", "widgets");
    expect(vault.resetBackgroundCache).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("github_pat_verified");
  });

  it("fails closed when encrypted vault storage is unavailable", async () => {
    vault.configured.mockReturnValue(false);

    await expect(
      provisionBackgroundGitHubAccess({
        octokit: {} as never,
        owner: "acme",
        repo: "widgets",
        token: "github_pat_verified",
      }),
    ).resolves.toEqual({ ok: false, reason: "vault-not-configured" });
    expect(vault.write).not.toHaveBeenCalled();
  });
});
