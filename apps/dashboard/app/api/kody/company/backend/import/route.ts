/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern company-backend-import-api
 * @ai-summary Imports a backend export dump into the Convex deployment via
 *   importExport.importChunk, chunked per table, with optional clear-first.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";

const CHUNK_SIZE = 200;

const importBodySchema = z.object({
  version: z.literal(1),
  tenantId: z.string().trim().min(1),
  exportedAt: z.string().optional(),
  clearFirst: z.boolean().optional(),
  tables: z.record(
    z.string().trim().min(1),
    z.array(z.record(z.string(), z.unknown())),
  ),
});

function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (!headerAuth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json(
      {
        error: "convex_url_not_configured",
        message:
          "CONVEX_URL is not set. Configure the Convex deployment URL before importing.",
      },
      { status: 400 },
    );
  }

  const payload = await req.json().catch(() => null);
  const parsed = importBodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tenantId, tables, clearFirst } = parsed.data;

  try {
    const client = new ConvexHttpClient(convexUrl);

    if (clearFirst) {
      await client.mutation(anyApi.importExport.clearRepo, { tenantId });
    }

    const counts: Array<[string, number]> = [];
    for (const [table, docs] of Object.entries(tables)) {
      for (const batch of chunk(docs, CHUNK_SIZE)) {
        await client.mutation(anyApi.importExport.importChunk, {
          table,
          docs: batch,
        });
      }
      counts.push([table, docs.length]);
    }

    return NextResponse.json({
      ok: true,
      cleared: clearFirst === true,
      imported: Object.fromEntries(counts),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "failed_to_import_backend",
        message:
          error instanceof Error ? error.message : "failed_to_import_backend",
      },
      { status: 500 },
    );
  }
}
