import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { createLoopDefinition } from "@kody-ade/agency-domain";

const PREFIX = "loop:";

function context(req: NextRequest, id: string) {
  const auth = getRequestAuth(req);
  if (!auth || !/^[a-z][a-z0-9-]{0,127}$/.test(id)) return null;
  return { tenantId: `${auth.owner}/${auth.repo}`, kind: `${PREFIX}${id}` };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const { id } = await params;
  const resolved = context(req, id);
  if (!resolved) {
    return NextResponse.json({ error: "invalid_loop" }, { status: 400 });
  }
  try {
    const loop = createLoopDefinition({ ...(await req.json()), id });
    const updatedAt = new Date().toISOString();
    await createBackendClient().mutation(api.repoDocs.save, {
      ...resolved,
      doc: loop,
      updatedAt,
    });
    return NextResponse.json({ loop: { ...loop, updatedAt } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_loop",
        message: error instanceof Error ? error.message : "Invalid Loop",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const { id } = await params;
  const resolved = context(req, id);
  if (!resolved) {
    return NextResponse.json({ error: "invalid_loop" }, { status: 400 });
  }
  await createBackendClient().mutation(api.repoDocs.remove, resolved);
  return NextResponse.json({ success: true });
}
