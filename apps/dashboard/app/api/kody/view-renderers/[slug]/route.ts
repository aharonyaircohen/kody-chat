/**
 * @fileType api-endpoint
 * @domain view-renderers
 * @pattern convex-crud-api
 * @ai-summary Reads, updates, and deletes one view renderer definition.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@dashboard/lib/activity/audit";
import { resolveKodyRequestScope } from "@dashboard/lib/auth/kody-request-scope";
import { verifyActorLogin } from "@kody-ade/base/auth";
import {
  deleteViewRendererDefinitionForTenant,
  isValidViewRendererSlug,
  parseViewRendererDefinition,
  readViewRendererDefinitionForTenant,
  serializeViewRendererDefinition,
  writeViewRendererDefinitionForTenant,
  type ViewRendererDefinition,
} from "@dashboard/lib/view-renderers/renderers";

const saveSchema = z.object({
  definition: z.string().min(2).max(20_000),
  actorLogin: z.string().optional(),
});

function toRow(
  definition: ViewRendererDefinition,
  htmlUrl = "",
  source: "repo" | "builtin" = "repo",
) {
  return {
    slug: definition.slug,
    name: definition.name,
    description: definition.description ?? "",
    purpose: definition.purpose,
    rule: definition.rule ?? "",
    data: definition.data ?? {},
    defaults: definition.defaults ?? {},
    type: definition.type,
    ui: definition.ui,
    source,
    htmlUrl,
    definition: serializeViewRendererDefinition(definition),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const resolved = await resolveKodyRequestScope(req);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const { slug } = await params;
    if (!isValidViewRendererSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const existing = await readViewRendererDefinitionForTenant({
      tenantId: resolved.tenantId,
      slug,
    });
    if (existing) {
      return NextResponse.json({
        renderer: toRow(existing.definition, existing.htmlUrl, existing.source),
      });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("[ViewRenderers] Error fetching renderer:", error);
    return NextResponse.json(
      {
        error: "fetch_failed",
        message:
          error instanceof Error ? error.message : "Failed to fetch renderer",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const resolved = await resolveKodyRequestScope(req);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const { slug } = await params;
    if (!isValidViewRendererSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const payload = saveSchema.parse(await req.json());
    const definition = parseViewRendererDefinition(payload.definition);
    if (definition.slug !== slug) {
      return NextResponse.json(
        { error: "slug_mismatch", message: "Renderer slug cannot change." },
        { status: 400 },
      );
    }
    if (resolved.repository) {
      const verified = await verifyActorLogin(req, payload.actorLogin);
      if (verified instanceof NextResponse) return verified;
    }
    const existing = await readViewRendererDefinitionForTenant({
      tenantId: resolved.tenantId,
      slug,
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const written = await writeViewRendererDefinitionForTenant({
      tenantId: resolved.tenantId,
      definition,
    });
    recordAudit(req, {
      action: "view-renderer.update",
      resource: slug,
      detail: `edited view renderer ${slug}`,
    });
    return NextResponse.json({
      renderer: toRow(written.definition, written.htmlUrl),
    });
  } catch (error) {
    console.error("[ViewRenderers] Error updating renderer:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "update_failed",
        message:
          error instanceof Error ? error.message : "Failed to update renderer",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const resolved = await resolveKodyRequestScope(req);
  if (resolved instanceof NextResponse) return resolved;

  try {
    const { slug } = await params;
    if (!isValidViewRendererSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    if (resolved.repository) {
      const actorLogin = new URL(req.url).searchParams.get("actorLogin") ?? undefined;
      const verified = await verifyActorLogin(req, actorLogin);
      if (verified instanceof NextResponse) return verified;
    }
    const existing = await readViewRendererDefinitionForTenant({
      tenantId: resolved.tenantId,
      slug,
    });
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await deleteViewRendererDefinitionForTenant({
      tenantId: resolved.tenantId,
      slug,
    });
    recordAudit(req, {
      action: "view-renderer.delete",
      resource: slug,
      detail: `deleted view renderer ${slug}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ViewRenderers] Error deleting renderer:", error);
    return NextResponse.json(
      {
        error: "delete_failed",
        message:
          error instanceof Error ? error.message : "Failed to delete renderer",
      },
      { status: 500 },
    );
  }
}
