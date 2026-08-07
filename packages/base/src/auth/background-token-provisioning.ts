import type { Octokit } from "@octokit/rest";

import {
  MANAGED_BACKGROUND_GITHUB_TOKEN,
  type BackgroundGitHubAccessProvisionResult,
} from "./background-token-contract";
import { _resetBackgroundCredentialCache } from "../vault/bootstrap";
import { isVaultConfigured } from "../vault/crypto";
import { invalidateVaultCache, readVault, writeVault } from "../vault/store";

/**
 * Persist a verified repository PAT for unattended Kody work.
 *
 * The reserved key keeps Kody-managed credentials separate from user-owned
 * secrets such as `GITHUB_TOKEN`. Values remain encrypted by the shared vault
 * and are never returned to callers.
 */
export async function provisionBackgroundGitHubAccess(input: {
  octokit: Octokit;
  owner: string;
  repo: string;
  token: string;
  actorLogin?: string | null;
  now?: string;
}): Promise<BackgroundGitHubAccessProvisionResult> {
  if (!isVaultConfigured()) {
    return { ok: false, reason: "vault-not-configured" };
  }

  const { doc, sha } = await readVault(input.octokit, input.owner, input.repo, {
    force: true,
  });
  const existing = doc.secrets[MANAGED_BACKGROUND_GITHUB_TOKEN];
  if (existing?.value === input.token) {
    return { ok: true, source: "managed-vault" };
  }

  const next = {
    ...doc,
    secrets: {
      ...doc.secrets,
      [MANAGED_BACKGROUND_GITHUB_TOKEN]: {
        value: input.token,
        updatedAt: input.now ?? new Date().toISOString(),
        ...(input.actorLogin ? { updatedBy: input.actorLogin } : {}),
      },
    },
  };
  await writeVault(
    input.octokit,
    input.owner,
    input.repo,
    next,
    sha,
    "chore(vault): update Kody background GitHub access",
  );
  invalidateVaultCache(input.owner, input.repo);
  _resetBackgroundCredentialCache();
  return { ok: true, source: "managed-vault" };
}
