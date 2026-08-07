/** Reserved vault key owned by Kody's unattended GitHub runtime. */
export const MANAGED_BACKGROUND_GITHUB_TOKEN = "KODY_GITHUB_TOKEN";

export type BackgroundGitHubAccessProvisionResult =
  | { ok: true; source: "managed-vault" }
  | { ok: false; reason: "vault-not-configured" };
