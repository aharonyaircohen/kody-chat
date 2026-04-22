/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern chat-runner-long-poll
 *
 * GET /api/kody/chat/pull?sessionId=xxx&token=yyy&since=N&timeoutMs=30000
 *
 * The kody2 chat runner calls this in a loop to fetch new user turns.
 * Auth is the HMAC session token we minted at dispatch. No GitHub or Kody
 * cookie auth — Actions runner context.
 *
 * Behavior:
 *   - Returns immediately with any turns at index >= `since`.
 *   - If none available, long-polls up to `timeoutMs` (default 25s) for a
 *     new user turn; returns `[]` on timeout so the runner can heartbeat.
 *   - Response includes `end: true` when the session is explicitly ended
 *     so the runner can exit cleanly instead of waiting for idle timeout.
 */

import { NextRequest, NextResponse } from "next/server"
import { verifySessionToken } from "@dashboard/lib/chat-token"
import { getTurnsSince, waitForNewTurn, turnCount } from "@dashboard/lib/chat-session-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DEFAULT_TIMEOUT_MS = 25_000
const MAX_TIMEOUT_MS = 55_000

function extractToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization")
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim()
  return req.nextUrl.searchParams.get("token")
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId")
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 })
  }

  const token = extractToken(req)
  if (!token || !verifySessionToken(sessionId, token)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 })
  }

  const since = parseInt(req.nextUrl.searchParams.get("since") ?? "0", 10) || 0
  const timeoutMs = Math.min(
    parseInt(req.nextUrl.searchParams.get("timeoutMs") ?? String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  )

  // Return immediately if there are already turns beyond `since`.
  let turns = getTurnsSince(sessionId, since)
  if (turns.length === 0) {
    await waitForNewTurn(sessionId, timeoutMs)
    turns = getTurnsSince(sessionId, since)
  }

  return NextResponse.json({
    turns,
    nextSince: turnCount(sessionId),
  })
}
