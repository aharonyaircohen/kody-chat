"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { resolveActiveRepo } from "@kody-ade/base/active-repo";
import { useAuth } from "@dashboard/lib/auth-context";
import {
  getReconciliationScope,
  isAutomaticReconciliationOrigin,
  shouldReconcileWebhook,
} from "./reconciliation";
import {
  failedReconciliationRecord,
  readReconciliationRecord,
  registerActiveWebhook,
  successfulReconciliationRecord,
  writeReconciliationRecord,
} from "./reconciliation-client";

/**
 * Repairs the active repository's GitHub hook once per policy version.
 *
 * This is deliberately a client-side coordinator: the PAT lives in the
 * browser, while the server endpoint and registrar own all GitHub calls.
 */
export function WebhookRegistrationReconciler() {
  const { auth, loading } = useAuth();
  const pathname = usePathname();
  const activeRepo = useMemo(
    () => resolveActiveRepo(auth, pathname),
    [auth, pathname],
  );

  useEffect(() => {
    if (
      loading ||
      !activeRepo?.token ||
      !activeRepo.owner ||
      !activeRepo.repo ||
      !isAutomaticReconciliationOrigin(
        window.location.origin,
        process.env.NEXT_PUBLIC_SERVER_URL ?? "",
      )
    ) {
      return;
    }

    const repo = activeRepo;
    const scope = getReconciliationScope(repo.owner, repo.repo);
    const now = Date.now();
    const previous = readReconciliationRecord(scope);
    if (!shouldReconcileWebhook(previous, { scope, now })) return;

    // Write before the request so React Strict Mode or a fast navigation
    // cannot start duplicate registrations for the same repository.
    writeReconciliationRecord(failedReconciliationRecord(scope, now));

    let cancelled = false;
    async function reconcile() {
      try {
        const body = await registerActiveWebhook(repo);

        if (!body.ok) {
          if (!cancelled && body.error !== "public_url_required") {
            toast.error("GitHub webhook setup needs attention", {
              description:
                body.message ||
                `Kody will use polling for ${repo.owner}/${repo.repo} until it is repaired.`,
            });
          }
          return;
        }

        writeReconciliationRecord(successfulReconciliationRecord(scope, now));
      } catch (error) {
        if (!cancelled) {
          toast.error("GitHub webhook setup needs attention", {
            description: `Kody will use polling for ${repo.owner}/${repo.repo} until it is repaired.`,
          });
          console.warn("Webhook reconciliation failed", {
            scope,
            error: String(error),
          });
        }
      }
    }

    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, loading]);

  return null;
}
