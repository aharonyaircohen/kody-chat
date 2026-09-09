import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { applyBrainImage } from "@kody-ade/brain/image-apply-command";
import { resolvePersonalBrainContextForUser } from "@dashboard/lib/brain/personal-context";
import "@dashboard/lib/brain/personal-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validServiceKey(req: NextRequest): boolean {
  const expected = process.env.KODY_SERVICE_KEY?.trim() ?? "";
  const supplied =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(supplied).digest(),
  );
}

export async function POST(req: NextRequest) {
  if (!validServiceKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const operationId =
    typeof body?.operationId === "string" ? body.operationId.trim() : "";
  const imageRef =
    typeof body?.imageRef === "string" ? body.imageRef.trim() : "";
  if (!userId || !operationId || !imageRef) {
    return NextResponse.json({ error: "Invalid restore job" }, { status: 400 });
  }
  const resolved = await resolvePersonalBrainContextForUser(userId, req);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  try {
    await applyBrainImage({
      context: resolved.context,
      dashboardUrl: new URL(req.url).origin,
      imageRef,
      reset: body?.reset === true,
      operationId,
    });
    return NextResponse.json({ ok: true, operationId });
  } catch (error) {
    return NextResponse.json(
      { error: "brain_restore_failed", message: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
