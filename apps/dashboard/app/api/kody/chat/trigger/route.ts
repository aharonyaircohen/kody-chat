/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern chat-trigger
 *
 * POST /api/kody/chat/trigger
 *
 * Persists the chat session file to the configured Kody state repo, then dispatches the
 * engine's `kody.yml` workflow with chat-mode inputs. The engine reads
 * `sessions/{sessionId}.jsonl`, runs `kody dispatch` → chat flow,
 * and streams events back to the dashboard via the ingest endpoint using
 * the inline HMAC token embedded in `dashboardUrl`.
 *
 * Body: {
 *   taskId: string       // sessionId (= taskId)
 *   messages: Array<{ role: "user" | "assistant"; content: string; timestamp: string }>
 *   dashboardUrl?: string // base dashboard URL; the ingest token is appended server-side
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireKodyAuth,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import { rejectSurfaceScopedRequest } from "@kody-ade/kody-chat/platform/surface-scope";
import { emitSystemEvent } from "@kody-ade/base/events";
import { createUserOctokit } from "@kody-ade/base/github/core";
import { ensureTriggerStateWriter } from "@kody-ade/kody-chat/user-state";
import { logger } from "@kody-ade/base/logger";
import { mintSessionToken } from "@dashboard/lib/chat-token";
import { maybeAppendPluginToolsToken } from "@kody-ade/kody-chat/platform/plugin-tools-config";
import {
  applyVibePrimerToMessages,
  type VibeTaskContext,
} from "@dashboard/lib/vibe/primer";
import { applyPageContextToLastUser } from "@kody-ade/kody-chat/core/page-context";
import { recordDispatchFailure } from "@dashboard/lib/health/dispatch-failures";
import { readStateText, writeStateText } from "@kody-ade/base/state-repo";
import { isLegacySessionWriteEnabled } from "@dashboard/lib/legacy-session-write";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

export const runtime = "nodejs";

// The chat workflow dispatches against the connected repo by default — that's
// where the user wants chat to operate (reads their code, runs tools on it).
// `KODY_CHAT_WORKFLOW_REPO` is an explicit override for deployments that
// centralize the engine workflow in one repo.
function getEngineRepo(req: NextRequest): { owner: string; repo: string } {
  const override = (process.env.KODY_CHAT_WORKFLOW_REPO ?? "").trim();
  if (override && override.includes("/")) {
    const [owner, repo] = override.split("/").map((s) => s.trim());
    if (owner && repo) return { owner, repo };
  }
  const headerAuth = getRequestAuth(req);
  if (headerAuth) {
    return { owner: headerAuth.owner, repo: headerAuth.repo };
  }
  const { GITHUB_OWNER, GITHUB_REPO } = process.env as Record<string, string>;
  return {
    owner: (GITHUB_OWNER ?? "aharonyaircohen").trim(),
    repo: (GITHUB_REPO ?? "Kody-Dashboard").trim(),
  };
}

// Chat workflow file is always `kody.yml`. The KODY_CHAT_WORKFLOW_ID env
// var is intentionally ignored — it was a debugging knob that accumulated
// stale values across Vercel projects and caused hard-to-diagnose 404s.
function getChatWorkflowId(): string {
  return "kody.yml";
}

function appendIngestToken(baseUrl: string, sessionId: string): string {
  const token = mintSessionToken(sessionId);
  const joiner = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${joiner}token=${token}`;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: unknown[];
}

// Primer logic now lives in @dashboard/lib/vibe/primer so the long-lived
// runner path (/interactive/append) and this one-shot dispatch path share
// the same wording.

/**
 * Mirror the session transcript into Convex (chatSessions/chatTurns) so the
 * history route reads it without touching GitHub. The state-repo JSONL write
 * below stays — the engine runner git-pulls `sessions/<id>.jsonl` (see
 * kody2/src/chat/session.ts), so it is a functional dependency, not a
 * duplicate.
 * TODO(dual-write retirement): the engine now reads Convex directly when its
 * Actions secrets (CONVEX_URL, KODY_SERVICE_KEY) are set — see kody2
 * src/chat/session-store.ts and docs/storage-backend.md ("Engine chat
 * transcript reads"). Once every engine repo has those secrets, delete the
 * state-repo JSONL write and keep only this Convex path.
 * Only messages beyond the already-recorded turn count are
 * appended (the dispatch body carries the full history each time).
 * Failures are logged, never thrown — a Convex hiccup must not block chat.
 */
async function mirrorSessionToConvex(
  owner: string,
  repo: string,
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  try {
    const client = getConvexClient();
    const tenantId = tenantIdFor(owner, repo);
    await client.mutation(backendApi.chatSessions.upsert, {
      tenantId,
      sessionId,
      meta: { type: "meta", mode: "one-shot" },
      updatedAt: new Date().toISOString(),
    });
    const existing = (await client.query(backendApi.chatTurns.list, {
      tenantId,
      sessionId,
    })) as Array<{ seq: number }>;
    for (const m of messages.slice(existing.length)) {
      await client.mutation(backendApi.chatTurns.append, {
        tenantId,
        sessionId,
        turn: {
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolCalls: m.toolCalls ?? [],
        },
      });
    }
  } catch (err) {
    logger.error({ err, sessionId }, "chat: convex transcript mirror failed");
  }
}

export async function POST(req: NextRequest) {
  // Surface tickets (phase 2 step 6) are limited to the in-process kody
  // endpoint; this backend is admin-only. PAT requests pass untouched.
  const surfaceRejection = rejectSurfaceScopedRequest(req.headers);
  if (surfaceRejection) return surfaceRejection;
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  let body: {
    taskId?: string;
    messages?: ChatMessage[];
    dashboardUrl?: string;
    vibeMode?: boolean;
    taskContext?: VibeTaskContext;
    /** Noun phrase for the page the user is viewing (see page-context.ts). */
    currentPage?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    taskId,
    messages: rawMessages = [],
    dashboardUrl,
    vibeMode,
    taskContext,
    currentPage,
  } = body;
  const primedMessages = vibeMode
    ? applyVibePrimerToMessages(rawMessages, taskContext)
    : rawMessages;
  // The engine has no system slot for ambient context — it replies to the
  // latest user turn using the JSONL as history. So prefix the page context
  // onto that turn (immutably). Only the current turn carries it; prior turns
  // stay clean, and it re-derives as the user navigates.
  const messages = applyPageContextToLastUser(primedMessages, currentPage);

  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const { owner, repo } = getEngineRepo(req);
  const workflowId = getChatWorkflowId();
  const sessionPath = `sessions/${taskId}.jsonl`;

  ensureTriggerStateWriter();
  const headerAuthForEvents = getRequestAuth(req);
  emitSystemEvent(
    "chat.message.sent",
    { sessionId: taskId, transport: "engine" },
    {
      userId: headerAuthForEvents?.userLogin
        ? `operator:${headerAuthForEvents.userLogin.toLowerCase()}`
        : null,
      sessionId: taskId,
      brand: { owner, repo },
      source: "server",
      octokit: headerAuthForEvents
        ? createUserOctokit(headerAuthForEvents.token)
        : null,
    },
  );

  // Serialize messages as JSONL
  const jsonlContent =
    messages
      .map((m) =>
        JSON.stringify({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          toolCalls: m.toolCalls ?? [],
        }),
      )
      .join("\n") + "\n";

  const octokit = await getUserOctokit(req);
  if (!octokit) {
    return NextResponse.json(
      { error: "No GitHub token available" },
      { status: 503 },
    );
  }

  try {
    logger.info(
      { taskId, owner, repo, messageCount: messages.length },
      "chat: writing session file",
    );

    // Legacy dual-write gate: with KODY_LEGACY_SESSION_WRITE=0 the state-repo
    // JSONL write is skipped; Convex (below) is the only transcript record.
    // See legacy-session-write.ts for when that is safe.
    if (isLegacySessionWriteEnabled()) {
      let sha: string | undefined;
      try {
        sha = (await readStateText(octokit, owner, repo, sessionPath))?.sha;
      } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status !== 404) {
          logger.warn(
            { err, taskId },
            "chat: could not check existing session file",
          );
        }
      }

      await writeStateText({
        octokit,
        owner,
        repo,
        path: sessionPath,
        message: `chat: update session ${taskId}`,
        content: jsonlContent,
        ...(sha ? { sha } : {}),
      });
    }

    await mirrorSessionToConvex(owner, repo, taskId, messages);

    logger.info({ taskId, owner, repo }, "chat: triggering workflow");

    const lastUserMessage =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    const workflowInputs: Record<string, string> = {
      sessionId: taskId,
      message: lastUserMessage,
    };
    if (dashboardUrl) {
      // Fail-open plugin-tools bridge (phase 2 step 1): with zero registered
      // plugin server tools this is a byte-level no-op — the dispatched URL
      // is identical to the pre-bridge payload (pinned by int tests).
      workflowInputs.dashboardUrl = maybeAppendPluginToolsToken(
        appendIngestToken(dashboardUrl, taskId),
        owner,
        repo,
      );
    }

    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowId,
      ref: "main",
      inputs: workflowInputs,
    });

    logger.info({ taskId, workflowId }, "chat: workflow dispatched");

    return NextResponse.json({ ok: true, taskId, workflowId });
  } catch (err) {
    logger.error({ err, taskId }, "chat: trigger failed");
    // Surface to the Health banner: a failed dispatch produces no run, so it's
    // otherwise invisible in the Activity list (this is how the GitHub Actions
    // outage 500s become observable).
    const ghStatus = (err as { status?: number }).status ?? 500;
    recordDispatchFailure(
      ghStatus,
      err instanceof Error ? err.message : "dispatch failed",
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trigger failed" },
      { status: 500 },
    );
  }
}
