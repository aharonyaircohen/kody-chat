import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";

export const dynamic = "force-dynamic";

const publishSchema = z.object({
  graphStorageId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  reportStorageId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  htmlStorageId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  generatedAt: z.string().datetime(),
  sourceRevision: z.string().trim().min(1).max(200).optional(),
  nodeCount: z.number().int().nonnegative().max(10_000_000),
  edgeCount: z.number().int().nonnegative().max(30_000_000),
  schemaVersion: z.number().int().positive().max(100),
});

async function context(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return { error: authError };
  const auth = getRequestAuth(req);
  if (!auth) {
    return {
      error: NextResponse.json({ error: "no_repo_context" }, { status: 400 }),
    };
  }
  return { tenantId: `${auth.owner}/${auth.repo}` };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const scoped = await context(req);
  if (scoped.error) return scoped.error;
  try {
    const bundle = await createBackendClient().query(api.knowledgeGraphs.get, {
      tenantId: scoped.tenantId,
    });
    return NextResponse.json(
      { bundle },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[knowledge-system] read failed", error);
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const scoped = await context(req);
  if (scoped.error) return scoped.error;
  try {
    const uploadUrl = await createBackendClient().mutation(
      api.knowledgeGraphs.createUpload,
      { tenantId: scoped.tenantId },
    );
    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error("[knowledge-system] upload URL failed", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const scoped = await context(req);
  if (scoped.error) return scoped.error;
  const parsed = publishSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  try {
    const bundleId = await createBackendClient().mutation(
      api.knowledgeGraphs.publish,
      {
        ...parsed.data,
        tenantId: scoped.tenantId,
        graphStorageId: parsed.data.graphStorageId as never,
        reportStorageId: parsed.data.reportStorageId as never,
        htmlStorageId: parsed.data.htmlStorageId as never,
      },
    );
    return NextResponse.json({ ok: true, bundleId });
  } catch (error) {
    console.error("[knowledge-system] publish failed", error);
    return NextResponse.json({ error: "publish_failed" }, { status: 500 });
  }
}
