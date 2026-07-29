import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  verifyRepoReadAccess,
  verifyRepoWriteAccess,
} from "@kody-ade/base/auth";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export const dynamic = "force-dynamic";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const publishSchema = z.object({
  toolId: idSchema,
  name: z.string().regex(/^[a-z][a-z0-9_]*$/).max(80),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  handlerKind: z.literal("knowledge_graph_search"),
  dataStorageId: z.string().regex(/^[A-Za-z0-9_-]+$/).min(8).max(128),
  dataSchemaVersion: z.number().int().positive().max(100),
  sourceWorkflow: z.string().trim().min(1).max(200),
  generatedAt: z.string().datetime(),
  nodeCount: z.number().int().nonnegative().max(10_000_000),
  edgeCount: z.number().int().nonnegative().max(30_000_000),
});
const stateSchema = z.object({ toolId: idSchema, enabled: z.boolean() });

function tenantIdFor(access: { auth: { owner: string; repo: string } }) {
  return `${access.auth.owner}/${access.auth.repo}`;
}

export async function GET(req: NextRequest) {
  const access = await verifyRepoReadAccess(req);
  if (access instanceof NextResponse) return access;
  try {
    const tools = await createBackendClient().query(api.chatTools.list, {
      tenantId: tenantIdFor(access),
    });
    return NextResponse.json(
      { tools },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[chat-tools] list failed", error);
    return NextResponse.json({ error: "chat_tools_unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const uploadUrl = await createBackendClient().mutation(
    api.chatTools.createUpload,
    { tenantId: tenantIdFor(access) },
  );
  return NextResponse.json({ uploadUrl });
}

export async function PUT(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = publishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  const id = await createBackendClient().mutation(api.chatTools.publish, {
    ...parsed.data,
    tenantId: tenantIdFor(access),
    dataStorageId: parsed.data.dataStorageId as never,
  });
  return NextResponse.json({ ok: true, id });
}

export async function PATCH(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = stateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  await createBackendClient().mutation(api.chatTools.setEnabled, {
    tenantId: tenantIdFor(access),
    ...parsed.data,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const parsed = idSchema.safeParse(req.nextUrl.searchParams.get("toolId"));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  await createBackendClient().mutation(api.chatTools.remove, {
    tenantId: tenantIdFor(access),
    toolId: parsed.data,
  });
  return NextResponse.json({ ok: true });
}
