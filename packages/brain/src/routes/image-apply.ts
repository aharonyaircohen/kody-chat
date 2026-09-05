/**
 * @fileType api-endpoint
 * @domain brain
 * @pattern brain-image-apply-route
 *
 * POST /api/kody/brain/image/apply applies the selected Brain image to the
 * user's Fly Brain. Selection remains metadata-only; this route owns runtime
 * mutation.
 */
import { NextRequest, NextResponse } from "next/server";

import { applyBrainImage } from "../image-apply-command";
import { logger } from "@kody-ade/base/logger";
import { resolvePersonalBrainContext } from "../personal-context";
import { requestOrigin } from "@kody-ade/base/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ApplyBody {
  imageRef?: string;
  reset?: boolean;
}

export async function POST(req: NextRequest) {
  const ctx = await resolvePersonalBrainContext(req);
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  if (!ctx.context.flyToken) {
    return NextResponse.json(
      {
        error:
          "Brain image apply needs a Fly token. Add FLY_API_TOKEN to Personal Credentials.",
      },
      { status: 400 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as ApplyBody;
    const result = await applyBrainImage({
      context: ctx.context,
      dashboardUrl: requestOrigin(req),
      imageRef: body.imageRef,
      reset: body.reset === true,
    });
    return NextResponse.json({
      ok: true,
      imageRef:
        result.runtime.desiredImageRef ??
        result.runtime.running?.imageRef ??
        null,
      runningImageRef: result.runtime.running?.imageRef ?? null,
      runningAt: result.runtime.running?.appliedAt ?? null,
      runningApp: result.runtime.running?.app ?? null,
      runningMachineId: result.runtime.running?.machineId ?? null,
      runtime: result.runtime,
      images: result.image.images,
      brain: {
        app: result.brain.app,
        machineId: result.brain.machineId,
        url: result.brain.url,
        org: result.brain.org,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, userId: ctx.context.userId },
      "brain image apply failed",
    );
    return NextResponse.json(
      { error: (err as { code?: string }).code ?? "brain_image_apply_failed", message },
      { status: (err as { status?: number }).status ?? 502 },
    );
  }
}
