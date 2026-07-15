/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern chat-global-persistence
 *
 * GET  /api/kody/chat/global?sessionId=...
 *   Read the persisted global conversation from the Convex backend
 *   (repoDocs kind "chat-global") as a fallback when localStorage is empty
 *   (e.g. fresh device, cleared cache). Returns `{ messages: ChatMessage[] }`
 *   or `{ messages: [] }` when no persisted conversation exists.
 *
 * POST /api/kody/chat/global
 *   Body: { sessionId, messages }
 *   Writes the active global session's messages to repoDocs kind
 *   "chat-global". Gated to ONCE per 24h per sessionId so the dashboard can
 *   ship a "save snapshot" ping after every turn without flooding the
 *   backend with writes. Skipped when:
 *     - the sessionId is missing
 *     - the messages array is empty
 *     - the count + last-message fingerprint matches the last write
 *     - a write already landed within the last 24h for this sessionId
 *   The gate is tracked in repoDocs kind "chat-global-gate" (a tiny
 *   `{ [sessionId]: isoTimestamp }` map).
 *
 * The unified chat thread (issue #66) lives primarily in
 * `useChatSessions("global")` → localStorage. This route is a
 * cross-device fallback, not the source of truth — writes are sparse
 * and reads are best-effort.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireKodyAuth, getRequestAuth } from "@kody-ade/base/auth";
import {
  setGitHubContext,
  clearGitHubContext,
  getOwner,
  getRepo,
} from "@dashboard/lib/github-client";
import { logger } from "@kody-ade/base/logger";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GLOBAL_KIND = "chat-global";
const GATE_KIND = "chat-global-gate";
const GATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

const postSchema = z.object({
  sessionId: z.string().min(1).max(200),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string(),
      timestamp: z.string().optional(),
    }),
  ),
});

interface LastWrittenMap {
  [sessionId: string]: string; // ISO timestamp
}

interface PersistedGlobalChat {
  version: 1;
  sessionId: string;
  updatedAt: string;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
    timestamp: string;
  }>;
}

async function readDoc<T>(kind: string): Promise<T | null> {
  const record = (await getConvexClient().query(backendApi.repoDocs.get, {
    tenantId: tenantIdFor(getOwner(), getRepo()),
    kind,
  })) as { doc: T } | null;
  return record?.doc ?? null;
}

async function saveDoc(kind: string, doc: unknown): Promise<void> {
  await getConvexClient().mutation(backendApi.repoDocs.save, {
    tenantId: tenantIdFor(getOwner(), getRepo()),
    kind,
    doc,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Cheap fingerprint for "did anything change since the last write?"
 * We compare message count + the text of the last message — good enough
 * to skip the common case where the user re-pings the same tail of the
 * conversation.
 */
function fingerprint(messages: ReadonlyArray<{ text: string }>): string {
  if (messages.length === 0) return "0:";
  const last = messages[messages.length - 1]?.text ?? "";
  return `${messages.length}:${last.slice(0, 200)}`;
}

function withinGate(lastIso: string | undefined, now: number): boolean {
  if (!lastIso) return false;
  const t = Date.parse(lastIso);
  if (Number.isNaN(t)) return false;
  return now - t < GATE_WINDOW_MS;
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  const headerAuth = getRequestAuth(req);
  if (headerAuth) {
    setGitHubContext(
      headerAuth.owner,
      headerAuth.repo,
      headerAuth.token,
      headerAuth.storeRepoUrl,
      headerAuth.storeRef,
    );
  }

  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const parsed = await readDoc<PersistedGlobalChat>(GLOBAL_KIND);
    if (!parsed || !Array.isArray(parsed.messages)) {
      return NextResponse.json({ messages: [] });
    }

    return NextResponse.json({
      messages: parsed.messages ?? [],
      sessionId: parsed.sessionId,
      updatedAt: parsed.updatedAt,
    });
  } catch (err) {
    logger.error({ err }, "[chat-global] GET failed");
    return NextResponse.json(
      { error: "Failed to load global chat" },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  const headerAuth = getRequestAuth(req);
  if (headerAuth) {
    setGitHubContext(
      headerAuth.owner,
      headerAuth.repo,
      headerAuth.token,
      headerAuth.storeRepoUrl,
      headerAuth.storeRef,
    );
  }

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }
    const { sessionId, messages } = parsed.data;

    if (messages.length === 0) {
      return NextResponse.json({ success: true, skipped: "empty" });
    }

    const now = Date.now();

    // 24h gate — read the gate doc, decide if we can write.
    const gate: LastWrittenMap = (await readDoc<LastWrittenMap>(GATE_KIND)) ?? {};
    if (withinGate(gate[sessionId], now)) {
      return NextResponse.json({ success: true, skipped: "gated-24h" });
    }

    // Read the existing snapshot for the content-identity skip.
    const existing = await readDoc<PersistedGlobalChat>(GLOBAL_KIND);
    const fingerprintNew = fingerprint(messages);
    if (
      existing &&
      existing.sessionId === sessionId &&
      Array.isArray(existing.messages) &&
      fingerprint(existing.messages) === fingerprintNew
    ) {
      return NextResponse.json({ success: true, skipped: "unchanged" });
    }

    const payload: PersistedGlobalChat = {
      version: 1,
      sessionId,
      updatedAt: new Date(now).toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        text: m.text,
        timestamp: m.timestamp ?? new Date(now).toISOString(),
      })),
    };
    await saveDoc(GLOBAL_KIND, payload);

    // Bump the gate.
    await saveDoc(GATE_KIND, {
      ...gate,
      [sessionId]: new Date(now).toISOString(),
    });

    return NextResponse.json({ success: true, written: messages.length });
  } catch (err) {
    logger.error({ err }, "[chat-global] POST failed");
    return NextResponse.json(
      { error: "Failed to save global chat" },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
