/**
 * @fileType hook
 * @domain kody
 * @pattern convex-live
 * @ai-summary Reactive Convex subscriptions replacing interval polling.
 *   useChatEventsLive subscribes to chatEvents.since for a session's event
 *   tail; useWorkflowRunStateLive subscribes to workflowRuns.list and derives
 *   the latest (or a specific) run's state. Both return undefined when
 *   NEXT_PUBLIC_CONVEX_URL is unset (ConvexClientProvider not mounted) so
 *   callers keep their existing polling as the fallback. The exposed data is
 *   exactly what the polled endpoints already return — no new surface.
 */
"use client";

import { useQuery } from "convex/react";
import { api as backendApi } from "@kody-ade/backend/api";
import { deepUnescapeKeys } from "@kody-ade/backend/escape-keys";
import { getStoredAuth } from "../api";
import {
  normalizeWorkflowRunState,
  type WorkflowRunStateRecord,
} from "../workflow-run-state";
import { CONVEX_LIVE_ENABLED } from "../convex/ConvexClientProvider";

/** Chat events live under a single global tenant — see chat-events-store.ts. */
const CHAT_EVENTS_TENANT = "global";

export interface LiveChatEvent {
  event: string;
  payload: unknown;
  runId: string;
  emittedAt: string;
}

interface ChatEventDoc {
  seq: number;
  event: LiveChatEvent;
}

interface WorkflowRunDoc {
  runId: string;
  state: unknown;
  runner?: { kind: "pool" | "fly"; machineId: string };
}

/**
 * Reactive tail of a chat session's event stream (chatEvents.since).
 * Returns undefined while loading or when live subscriptions are disabled;
 * callers fall back to /api/kody/events/{poll,stream} polling.
 */
export function useChatEventsLive(
  sessionId: string | undefined,
  afterSeq = -1,
): LiveChatEvent[] | undefined {
  // CONVEX_LIVE_ENABLED is a build-time constant, so hook order is stable.
  if (!CONVEX_LIVE_ENABLED) return undefined;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const docs = useQuery(
    backendApi.chatEvents.since,
    sessionId
      ? { tenantId: CHAT_EVENTS_TENANT, sessionId, afterSeq }
      : "skip",
  ) as ChatEventDoc[] | undefined;
  if (!docs) return undefined;
  // Stored payloads are key-escaped (Convex reserves $/_ prefixes) —
  // subscriptions bypass the wrapped HTTP client, so unescape here.
  return docs.map((doc) => deepUnescapeKeys(doc.event));
}

/**
 * Reactive workflow run state (workflowRuns.list). Mirrors what
 * GET /api/kody/company/workflows/:id/runs returns: a specific run when
 * `runId` is given, otherwise the latest `run-*` entry.
 * Returns undefined while loading or when live subscriptions are disabled.
 */
export function useWorkflowRunStateLive(
  workflowId: string | undefined,
  runId?: string,
): WorkflowRunStateRecord | null | undefined {
  // CONVEX_LIVE_ENABLED is a build-time constant, so hook order is stable.
  if (!CONVEX_LIVE_ENABLED) return undefined;
  const auth = getStoredAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const docs = useQuery(
    backendApi.workflowRuns.list,
    auth && workflowId
      ? { tenantId: `${auth.owner}/${auth.repo}`, workflowId }
      : "skip",
  ) as WorkflowRunDoc[] | undefined;
  if (!docs || !workflowId) return undefined;

  const targetRunId =
    runId ??
    docs
      .filter((doc) => /^run-[a-z0-9]+$/.test(doc.runId))
      .map((doc) => doc.runId)
      .sort()
      .at(-1);
  if (!targetRunId) return null;

  const doc = docs.find((d) => d.runId === targetRunId);
  // Stored payloads are key-escaped — see useChatEventsLive.
  const state = doc ? normalizeWorkflowRunState(deepUnescapeKeys(doc.state)) : null;
  return state
    ? { workflowId, runId: targetRunId, state, ...(doc?.runner ? { runner: doc.runner } : {}) }
    : null;
}
