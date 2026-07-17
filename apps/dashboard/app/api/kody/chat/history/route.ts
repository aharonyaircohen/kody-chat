/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern chat-history
 *
 * GET /api/kody/chat/history?taskId=xxx
 *
 * Fetches the chat session history from the Convex transcript record
 * (chatSessions/chatTurns).
 * Used when reopening a task's chat to restore full conversation context.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireKodyAuth, getRequestAuth } from "@kody-ade/base/auth";
import { logger } from "@kody-ade/base/logger";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: unknown[];
}

// The engine repo is determined from auth headers (client's repo).
function getEngineRepo(req: NextRequest): { owner: string; repo: string } {
  const headerAuth = getRequestAuth(req);
  if (headerAuth) {
    return { owner: headerAuth.owner, repo: headerAuth.repo };
  }
  const override = process.env.KODY_CHAT_WORKFLOW_REPO;
  if (override && override.includes("/")) {
    const [owner, repo] = override.split("/");
    return { owner, repo };
  }
  const { GITHUB_OWNER, GITHUB_REPO } = process.env as Record<string, string>;
  return {
    owner: GITHUB_OWNER ?? "aharonyaircohen",
    repo: GITHUB_REPO ?? "Kody-Dashboard",
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  const v = value as ChatMessage | null;
  return !!v && typeof v === "object" && typeof v.role === "string";
}

async function readConvexMessages(
  owner: string,
  repo: string,
  sessionId: string,
): Promise<ChatMessage[] | null> {
  const turns = (await getConvexClient().query(backendApi.chatTurns.list, {
    tenantId: tenantIdFor(owner, repo),
    sessionId,
  })) as Array<{ seq: number; turn: unknown }>;
  if (turns.length === 0) return null;
  return [...turns]
    .sort((a, b) => a.seq - b.seq)
    .map((doc) => doc.turn)
    .filter(isChatMessage);
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  const { owner, repo } = getEngineRepo(req);

  try {
    const convexMessages = await readConvexMessages(owner, repo, taskId);
    if (convexMessages !== null) {
      return NextResponse.json({ messages: convexMessages });
    }
    return NextResponse.json({ messages: [] });
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) {
      return NextResponse.json({ messages: [] });
    }
    logger.error({ err, taskId }, "chat history: fetch failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch history" },
      { status: 500 },
    );
  }
}
