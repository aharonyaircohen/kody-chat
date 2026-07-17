/**
 * @fileType util
 * @domain kody
 * @pattern interactive-session
 *
 * Server-side helpers for the long-lived "interactive runner" chat mode.
 * The mode is gated by a meta line at the top of the session JSONL — see
 * kody2/src/chat/session.ts (readMeta). The runner enters a poll loop
 * instead of replying once and exiting.
 *
 * Why this lives in its own module: the existing trigger route does
 * dispatch-per-turn and assumes one workflow run = one reply. Interactive
 * mode breaks that — start() dispatches once, then append() writes to the
 * Convex transcript without triggering anything new.
 *
 * Auth model is the same inline HMAC token as one-shot chat — see
 * chat-token.ts. The runner verifies the token on ingest POSTs so we
 * don't need a shared session-state DB.
 */

import type { Octokit } from "@octokit/rest";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

const SESSION_DIR = "sessions";
const DEFAULT_BRANCH = "main";

/** Meta line written as the first JSONL row. The engine reads it via readMeta. */
export interface SessionMeta {
  type: "meta";
  mode: "interactive" | "one-shot";
  createdAt: string;
  /** Idle window before the runner exits (default: 5min in engine). */
  idleExitMs?: number;
  /** Hard cap on session lifetime (default: 30min in engine, max 360min via GHA). */
  hardCapMs?: number;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: unknown[];
}

export function sessionFilePath(sessionId: string): string {
  return `${SESSION_DIR}/${sessionId}.jsonl`;
}

export function buildMetaLine(
  opts: { idleExitMs?: number; hardCapMs?: number } = {},
): SessionMeta {
  return {
    type: "meta",
    mode: "interactive",
    createdAt: new Date().toISOString(),
    ...(opts.idleExitMs !== undefined ? { idleExitMs: opts.idleExitMs } : {}),
    ...(opts.hardCapMs !== undefined ? { hardCapMs: opts.hardCapMs } : {}),
  };
}

/**
 * Writes the meta record at the start of an interactive session.
 *
 * `initialTurn` (optional): when provided, the first user turn is written in
 * the SAME commit as the meta line, so the runner sees it on its first read.
 * This is load-bearing for the vibe auto-kickoff: previously the kickoff turn
 * was written by a SECOND request (`/interactive/append`) right after this
 * one, and the two writes raced on the branch HEAD — the append's turn was
 * frequently lost, leaving a meta-only session. The runner then booted, found
 * no turn, and idle-exited with turnsCompleted:0 (the "handoff ran but nothing
 * happened / chat sits silent" bug). Folding the first turn into the meta
 * write removes that race entirely.
 *
 * Convex mutations provide the durable write boundary for concurrent starts.
 */
export async function writeSessionMeta(
  octokit: Octokit,
  owner: string,
  repo: string,
  sessionId: string,
  meta: SessionMeta,
  branch: string = DEFAULT_BRANCH,
  maxRetries = 4,
  initialTurn?: ChatTurn,
): Promise<void> {
  await recordSessionStart(owner, repo, sessionId, meta, initialTurn);
}

/**
 * Appends a single user turn to the Convex transcript.
 * Returns the new turn count so the caller can update local UI watermarks.
 *
 */
export async function appendUserTurn(
  octokit: Octokit,
  owner: string,
  repo: string,
  sessionId: string,
  turn: ChatTurn,
  branch: string = DEFAULT_BRANCH,
  maxRetries = 3,
): Promise<{ turnCount: number }> {
  await recordTurn(owner, repo, sessionId, turn);
  const turns = await createBackendClient().query(backendApi.chatTurns.list, {
    tenantId: `${owner}/${repo}`,
    sessionId,
  });
  return { turnCount: (turns as unknown[]).length };
}

export async function readSessionTranscript(owner: string, repo: string, sessionId: string) {
  const result = await createBackendClient().query(backendApi.chatSessions.get, {
    tenantId: `${owner}/${repo}`,
    sessionId,
  }) as { session: { meta: SessionMeta }; turns: Array<{ seq: number; turn: ChatTurn }> } | null;
  if (!result) return null;
  return { meta: result.session.meta, turns: result.turns.sort((a, b) => a.seq - b.seq).map((entry) => entry.turn) };
}

export async function recordSessionStart(owner: string, repo: string, sessionId: string, meta: SessionMeta, initialTurn?: ChatTurn): Promise<void> {
  const client = createBackendClient();
  await client.mutation(backendApi.chatSessions.upsert, { tenantId: `${owner}/${repo}`, sessionId, meta, updatedAt: new Date().toISOString() });
  if (initialTurn) await recordTurn(owner, repo, sessionId, initialTurn);
}

export async function recordTurn(owner: string, repo: string, sessionId: string, turn: ChatTurn): Promise<void> {
  await createBackendClient().mutation(backendApi.chatTurns.append, { tenantId: `${owner}/${repo}`, sessionId, turn: { ...turn, toolCalls: turn.toolCalls ?? [] } });
}
