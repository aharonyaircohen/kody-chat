/**
 * Browser-side policy for bounded webhook reconciliation.
 *
 * The registrar remains server-owned. This module only decides when the
 * client may ask the registrar to repair the active repository, so auth and
 * GitHub API concerns do not leak into each other.
 */

export const RECONCILIATION_VERSION = "v1";
export const RECONCILIATION_RETRY_MS = 60 * 60 * 1000;

export type WebhookReconciliationRecord = {
  version: string;
  scope: string;
  status: "ok" | "failed";
  attemptedAt: number;
};

export function getReconciliationScope(owner: string, repo: string): string {
  return `${owner.trim().toLowerCase()}/${repo.trim().toLowerCase()}`;
}

export function isAutomaticReconciliationOrigin(
  currentOrigin: string,
  configuredPublicUrl: string,
): boolean {
  try {
    const current = new URL(currentOrigin);
    if (!configuredPublicUrl.trim()) {
      return current.protocol === "https:" && current.hostname !== "localhost";
    }
    const configured = new URL(configuredPublicUrl);
    return (
      configured.protocol === "https:" && configured.origin === current.origin
    );
  } catch {
    return false;
  }
}

export function shouldReconcileWebhook(
  record: WebhookReconciliationRecord | undefined,
  input: { scope: string; now: number },
): boolean {
  if (!record) return true;
  if (record.version !== RECONCILIATION_VERSION) return true;
  if (record.scope !== input.scope) return true;
  if (record.status === "ok") return false;
  return input.now - record.attemptedAt >= RECONCILIATION_RETRY_MS;
}
