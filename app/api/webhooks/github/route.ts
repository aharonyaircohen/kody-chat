/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern github-webhook
 *
 * POST /api/webhooks/github
 *
 * GitHub webhook receiver. Verifies the source IP against GitHub's
 * published webhook CIDR ranges (https://api.github.com/meta) instead
 * of using a shared HMAC secret — no env var to manage. See
 * src/dashboard/lib/webhooks/github-ip.ts for rationale.
 *
 * On accepted delivery, invalidates the in-memory cache for the affected
 * resource so the next read picks up the change without waiting for TTL.
 *
 * This is the foundation of the push-based architecture that replaces
 * polling. See CLAUDE.md > "GitHub API rate-limit rules".
 *
 * Subscribed events (configured at hook registration):
 *   issues, issue_comment, pull_request, pull_request_review,
 *   workflow_run, workflow_job, check_run, push
 *
 * Idempotency: GitHub may deliver the same event more than once. We dedupe
 * by X-GitHub-Delivery via an in-memory LRU. Cross-instance duplicate
 * delivery is harmless — invalidation is idempotent.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  invalidateIssueCache,
  invalidatePRCache,
  invalidateBranchCache,
  invalidateWorkflowCache,
} from "@dashboard/lib/github-client";
import { getClientIp, isFromGitHub } from "@dashboard/lib/webhooks/github-ip";
import { logger } from "@dashboard/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ Delivery dedupe (per-instance) ============

const SEEN_DELIVERIES_MAX = 512;
const seenDeliveries = new Set<string>();
const seenOrder: string[] = [];

function rememberDelivery(id: string): boolean {
  if (seenDeliveries.has(id)) return true;
  seenDeliveries.add(id);
  seenOrder.push(id);
  if (seenOrder.length > SEEN_DELIVERIES_MAX) {
    const evicted = seenOrder.shift();
    if (evicted) seenDeliveries.delete(evicted);
  }
  return false;
}

// ============ Event dispatch ============

interface IssuesPayload {
  issue?: { number?: number };
}
interface IssueCommentPayload {
  issue?: { number?: number };
}
interface PullRequestPayload {
  pull_request?: { number?: number };
}

function dispatch(event: string, payload: unknown): { handled: boolean; detail: string } {
  switch (event) {
    case "ping":
      return { handled: true, detail: "ping" };

    case "issues":
    case "issue_comment": {
      const p = payload as IssuesPayload | IssueCommentPayload;
      const num = p?.issue?.number;
      invalidateIssueCache(typeof num === "number" ? num : undefined);
      return { handled: true, detail: `issue#${num ?? "?"}` };
    }

    case "pull_request":
    case "pull_request_review":
    case "pull_request_review_comment": {
      const p = payload as PullRequestPayload;
      invalidatePRCache();
      // PRs are also exposed as issues in the GitHub API; clear that too.
      invalidateIssueCache(p?.pull_request?.number);
      return { handled: true, detail: `pr#${p?.pull_request?.number ?? "?"}` };
    }

    case "workflow_run":
    case "workflow_job":
    case "check_run":
    case "check_suite":
      invalidateWorkflowCache();
      return { handled: true, detail: event };

    case "push":
    case "create":
    case "delete":
      invalidateBranchCache();
      return { handled: true, detail: event };

    default:
      return { handled: false, detail: event };
  }
}

// ============ Handler ============

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req.headers);
  const allowed = await isFromGitHub(ip);
  if (!allowed) {
    logger.warn(
      { event: "webhook_unauthorized_ip", ip: ip ?? "(none)" },
      "Webhook rejected: source IP not in GitHub's hook CIDRs",
    );
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const eventType = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? "";

  if (deliveryId && rememberDelivery(deliveryId)) {
    return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const result = dispatch(eventType, payload);
  logger.info(
    {
      event: "webhook_received",
      type: eventType,
      delivery: deliveryId,
      handled: result.handled,
      detail: result.detail,
    },
    "GitHub webhook processed",
  );

  return NextResponse.json({ ok: true, handled: result.handled }, { status: 200 });
}
