/** Convex-owned capability detail API. */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { api } from "@kody-ade/backend/api"
import { createBackendClient } from "@kody-ade/backend/client"
import { requireKodyAuth, verifyActorLogin, getRequestAuth } from "@kody-ade/base/auth"
import { recordAudit } from "@kody-ade/base/activity/audit"
import { isValidSlug, PERMISSION_MODES } from "../capabilities"

const skillSchema = z.object({ name: z.string().min(1).max(64), body: z.string().default("") })
const shellSchema = z.object({ name: z.string().regex(/^[a-zA-Z0-9._-]+\.sh$/), content: z.string().default("") })
const mcpServerSchema = z.object({ name: z.string().regex(/^[a-zA-Z0-9_-]+$/), command: z.string().min(1), args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional() })
const updateSchema = z.object({ describe: z.string().optional(), instructions: z.string().min(1).optional(), prompt: z.string().min(1).optional(), model: z.string().optional(), permissionMode: z.enum(PERMISSION_MODES).optional(), tools: z.array(z.string()).optional(), skills: z.array(skillSchema).optional(), shellScripts: z.array(shellSchema).optional(), mcpServers: z.array(mcpServerSchema).optional(), landing: z.enum(["pr", "comment"]).optional(), profileJsonOverride: z.string().optional(), actorLogin: z.string().optional() })

function context(req: NextRequest): string | null {
  const auth = getRequestAuth(req)
  return auth ? `${auth.owner}/${auth.repo}` : null
}

async function getCapability(tenantId: string, slug: string): Promise<any | null> {
  const row = await createBackendClient().query(api.catalog.get, { tenantId, category: "capability", slug })
  return (row as { doc?: unknown } | null)?.doc ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const authError = await requireKodyAuth(req)
  if (authError instanceof NextResponse) return authError
  const tenantId = context(req)
  if (!tenantId) return NextResponse.json({ error: "repository_context_required" }, { status: 400 })
  const { slug } = await params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  try {
    const capability = await getCapability(tenantId, slug)
    return capability ? NextResponse.json({ capability }) : NextResponse.json({ error: "not_found" }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ error: "fetch_failed", message: error instanceof Error ? error.message : "Failed to fetch capability" }, { status: 503 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const authError = await requireKodyAuth(req)
  if (authError instanceof NextResponse) return authError
  const tenantId = context(req)
  if (!tenantId) return NextResponse.json({ error: "repository_context_required" }, { status: 400 })
  const { slug } = await params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  try {
    const input = updateSchema.parse(await req.json())
    const actorResult = await verifyActorLogin(req, input.actorLogin)
    if (actorResult instanceof NextResponse) return actorResult
    const existing = await getCapability(tenantId, slug)
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 })
    const capability = {
      ...existing,
      ...input,
      prompt: input.instructions ?? input.prompt ?? existing.prompt,
      updatedAt: new Date().toISOString(),
      source: "local",
      readOnly: false,
    }
    await createBackendClient().mutation(api.catalog.save, { tenantId, category: "capability", slug, doc: capability, source: "local", updatedAt: capability.updatedAt })
    recordAudit(req, { action: "capability.update", resource: slug, detail: `edited capability ${slug}` })
    return NextResponse.json({ capability })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "validation_error", details: error.issues }, { status: 400 })
    return NextResponse.json({ error: "update_failed", message: error instanceof Error ? error.message : "Failed to update capability" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const authError = await requireKodyAuth(req)
  if (authError instanceof NextResponse) return authError
  const tenantId = context(req)
  if (!tenantId) return NextResponse.json({ error: "repository_context_required" }, { status: 400 })
  const { slug } = await params
  if (!isValidSlug(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  const actorResult = await verifyActorLogin(req, new URL(req.url).searchParams.get("actorLogin") ?? undefined)
  if (actorResult instanceof NextResponse) return actorResult
  try {
    const existing = await getCapability(tenantId, slug)
    if (!existing) return NextResponse.json({ success: true, alreadyMissing: true })
    await createBackendClient().mutation(api.catalog.remove, { tenantId, category: "capability", slug })
    recordAudit(req, { action: "capability.delete", resource: slug, detail: `deleted capability ${slug}` })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "delete_failed", message: error instanceof Error ? error.message : "Failed to delete capability" }, { status: 500 })
  }
}
