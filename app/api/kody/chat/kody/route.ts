/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern direct-llm-stream
 *
 * POST /api/kody/chat/kody
 *
 * In-process chat endpoint for the "Kody" agent. Streams replies directly
 * from the configured provider (Gemini by default) using the Vercel AI SDK.
 * No GitHub Actions, no VPS, no runner cold start — the request goes
 * straight from the Vercel function to the model and back.
 *
 * Body: {
 *   messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
 *   model?: string   // optional provider-specific model id override
 * }
 *
 * Response: text/plain stream of the assistant reply (AI SDK text stream
 * protocol — client accumulates chunks into the assistant bubble).
 */

import { NextRequest, NextResponse } from "next/server"
import { streamText, type ModelMessage } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { AGENT_KODY } from "@dashboard/lib/agents"
import { requireKodyAuth } from "@dashboard/lib/auth"
import { logger } from "@dashboard/lib/logger"

export const runtime = "nodejs"
// Short chats only; 60 s is plenty for a single LLM call + streaming.
export const maxDuration = 60

const DEFAULT_MODEL = process.env.KODY_DIRECT_MODEL ?? "gemini-2.0-flash"

interface IncomingMessage {
  role: "user" | "assistant" | "system"
  content: string
}

function normalizeMessages(raw: IncomingMessage[]): ModelMessage[] {
  return raw
    .filter((m) => typeof m?.content === "string" && m.content.trim() !== "")
    .map((m) => ({ role: m.role, content: m.content }) as ModelMessage)
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req)
  if (authError) return authError

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured on the server" },
      { status: 503 },
    )
  }

  let body: { messages?: IncomingMessage[]; model?: string }
  try {
    body = (await req.json()) as { messages?: IncomingMessage[]; model?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const messages = normalizeMessages(body.messages ?? [])
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required (non-empty)" }, { status: 400 })
  }

  const modelId = body.model ?? DEFAULT_MODEL
  const google = createGoogleGenerativeAI({ apiKey })

  try {
    const result = streamText({
      model: google(modelId),
      system: AGENT_KODY.systemPrompt,
      messages,
    })
    logger.info({ modelId, messageCount: messages.length }, "kody-direct: streaming")
    return result.toTextStreamResponse()
  } catch (err) {
    logger.error({ err }, "kody-direct: stream failed")
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stream failed" },
      { status: 500 },
    )
  }
}
