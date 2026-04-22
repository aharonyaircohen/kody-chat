/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern server-sent-events
 *
 * GET /api/kody/events/stream?taskId=xxx
 *
 * Server-Sent Events endpoint for real-time chat streaming. Subscribes to
 * the in-process chat-event-bus; events originate from the engine's HTTP
 * push to /api/kody/events/ingest. No GitHub polling — chat is ephemeral.
 *
 * Events are streamed in SSE format: `data: {json}\n\n`.
 * Terminal events: `chat.done`, `chat.error` — endpoint closes after these.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireKodyAuth } from "@dashboard/lib/auth"
import { subscribe } from "@dashboard/lib/chat-event-bus"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ChatEventEntry {
  runId?: string
  event: string
  payload?: {
    sessionId?: string
    role?: "user" | "assistant"
    content?: string
    timestamp?: string
    error?: string
    [key: string]: unknown
  }
  emittedAt?: string
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req)
  if (authError) return authError

  const sessionId = req.nextUrl.searchParams.get("taskId")
  if (!sessionId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 })
  }

  // ?test=1 — non-streaming mode for integration tests
  if (req.nextUrl.searchParams.get("test") === "1") {
    return NextResponse.json(
      {
        note: "test mode — not streaming",
        contentType: "text/event-stream",
        sessionId,
      },
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Test-Mode": "true",
        },
      },
    )
  }

  const encoder = new TextEncoder()
  let active = true
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
    },
    cancel() {
      active = false
      unsubscribe?.()
    },
  })

  unsubscribe = subscribe(sessionId, (raw) => {
    const ctrl = controllerRef
    if (!active || !ctrl) return
    const event = raw as ChatEventEntry
    const payload = event.payload ?? {}

    if (event.event === "chat.done" || event.event === "chat.error") {
      const data = event.event === "chat.done"
        ? JSON.stringify({ type: "chat.done", sessionId, runId: event.runId })
        : JSON.stringify({ type: "chat.error", sessionId, error: payload.error })
      try { ctrl.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { /* closed */ }
      active = false
      try { ctrl.close() } catch { /* already closed */ }
      return
    }

    if (event.event === "chat.message") {
      const data = JSON.stringify({
        type: "chat.message",
        sessionId: payload.sessionId ?? sessionId,
        runId: event.runId,
        role: payload.role,
        content: payload.content,
        timestamp: payload.timestamp,
      })
      try { ctrl.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { /* closed */ }
    }
  })

  // Initial heartbeat so the client knows the connection is live.
  if (controllerRef) {
    try {
      (controllerRef as ReadableStreamDefaultController<Uint8Array>).enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`),
      )
    } catch { /* closed */ }
  }

  req.signal.addEventListener("abort", () => {
    active = false
    unsubscribe?.()
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
