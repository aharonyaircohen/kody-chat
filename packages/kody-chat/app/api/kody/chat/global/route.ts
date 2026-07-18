/** Cross-device global chat persistence backed by Convex. */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { api } from "@kody-ade/backend/api"
import { createBackendClient } from "@kody-ade/backend/client"
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const postSchema = z.object({
  sessionId: z.string().min(1).max(200),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      text: z.string(),
      timestamp: z.string().optional(),
    }),
  ),
})

function tenant(req: NextRequest): string {
  const auth = getRequestAuth(req)
  if (auth) return `${auth.owner}/${auth.repo}`
  return `${process.env.GITHUB_OWNER ?? "aharonyaircohen"}/${process.env.GITHUB_REPO ?? "Kody-Dashboard"}`
}

function toMessage(turn: { turn: unknown }): { role: "user" | "assistant"; text: string; timestamp?: string } | null {
  const value = turn.turn as { role?: unknown; content?: unknown; timestamp?: unknown }
  if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return null
  return {
    role: value.role,
    text: value.content,
    ...(typeof value.timestamp === "string" ? { timestamp: value.timestamp } : {}),
  }
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req)
  if (authError) return authError
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? ""
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 })

  try {
    const turns = (await createBackendClient().query(api.chatTurns.list, {
      tenantId: tenant(req),
      sessionId,
    })) as Array<{ seq: number; turn: unknown }>
    const messages = turns
      .sort((a, b) => a.seq - b.seq)
      .map(toMessage)
      .filter((message): message is NonNullable<typeof message> => message !== null)
    return NextResponse.json({ messages, sessionId })
  } catch {
    return NextResponse.json({ error: "Failed to load global chat" }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req)
  if (authError) return authError
  const parsed = postSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const { sessionId, messages } = parsed.data
  if (messages.length === 0) return NextResponse.json({ success: true, skipped: "empty" })

  try {
    const client = createBackendClient()
    const tenantId = tenant(req)
    const existing = (await client.query(api.chatTurns.list, { tenantId, sessionId })) as Array<{ seq: number; turn: unknown }>
    await client.mutation(api.chatSessions.upsert, {
      tenantId,
      sessionId,
      meta: { type: "meta", mode: "one-shot", createdAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    })
    for (const message of messages.slice(existing.length)) {
      await client.mutation(api.chatTurns.append, {
        tenantId,
        sessionId,
        turn: {
          role: message.role,
          content: message.text,
          timestamp: message.timestamp ?? new Date().toISOString(),
          toolCalls: [],
        },
      })
    }
    return NextResponse.json({ success: true, saved: Math.max(0, messages.length - existing.length) })
  } catch {
    return NextResponse.json({ error: "Failed to save global chat" }, { status: 503 })
  }
}
