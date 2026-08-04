import { describe, expect, it } from "vitest";
import {
  RECONCILIATION_RETRY_MS,
  RECONCILIATION_VERSION,
  getReconciliationScope,
  isAutomaticReconciliationOrigin,
  shouldReconcileWebhook,
  type WebhookReconciliationRecord,
} from "../../src/dashboard/lib/webhooks/reconciliation";

describe("webhook reconciliation policy", () => {
  const now = 1_000_000;

  it("reconciles a repository that has never been checked", () => {
    expect(
      shouldReconcileWebhook(undefined, {
        scope: "acme/service",
        now,
      }),
    ).toBe(true);
  });

  it("does not retry a successful repository on every page load", () => {
    const record: WebhookReconciliationRecord = {
      version: RECONCILIATION_VERSION,
      scope: "acme/service",
      status: "ok",
      attemptedAt: now - 1,
    };

    expect(shouldReconcileWebhook(record, { scope: "acme/service", now })).toBe(
      false,
    );
  });

  it("retries a failed repository only after the cooldown", () => {
    const record: WebhookReconciliationRecord = {
      version: RECONCILIATION_VERSION,
      scope: "acme/service",
      status: "failed",
      attemptedAt: now - RECONCILIATION_RETRY_MS,
    };

    expect(shouldReconcileWebhook(record, { scope: "acme/service", now })).toBe(
      true,
    );
    expect(
      shouldReconcileWebhook(
        { ...record, attemptedAt: now - RECONCILIATION_RETRY_MS + 1 },
        { scope: "acme/service", now },
      ),
    ).toBe(false);
  });

  it("invalidates records when the repository or policy version changes", () => {
    const record: WebhookReconciliationRecord = {
      version: RECONCILIATION_VERSION,
      scope: "acme/service",
      status: "ok",
      attemptedAt: now,
    };

    expect(shouldReconcileWebhook(record, { scope: "acme/other", now })).toBe(
      true,
    );
    expect(
      shouldReconcileWebhook(
        { ...record, version: "older" },
        { scope: "acme/service", now },
      ),
    ).toBe(true);
  });

  it("normalizes repository scopes for stable storage keys", () => {
    expect(getReconciliationScope(" Acme ", " Service ")).toBe("acme/service");
  });

  it("only enables automatic repair on the configured public origin", () => {
    expect(
      isAutomaticReconciliationOrigin(
        "https://kody.example.com",
        "https://kody.example.com/",
      ),
    ).toBe(true);
    expect(
      isAutomaticReconciliationOrigin(
        "https://preview-kody.vercel.app",
        "https://kody.example.com",
      ),
    ).toBe(false);
    expect(isAutomaticReconciliationOrigin("http://localhost:3333", "")).toBe(
      false,
    );
    expect(
      isAutomaticReconciliationOrigin("https://kody.example.com", ""),
    ).toBe(true);
  });
});
