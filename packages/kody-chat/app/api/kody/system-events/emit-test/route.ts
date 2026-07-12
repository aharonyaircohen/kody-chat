/**
 * @fileType api-route
 * @domain events
 * @pattern dev-test-emitter
 * @ai-summary DEV-ONLY: emits any catalog event server-side so operators can
 *   test trigger wiring for server-semantics events (chat.*, auth.*, ...)
 *   that the browser bridge intentionally rejects. Disabled outside
 *   development builds.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserOctokit } from "@kody-ade/base/github/core";
import {
  emitSystemEvent,
  isSystemEventName,
  type SystemEventName,
  type SystemEventPayload,
} from "@kody-ade/base/events";
import { resolveUnifiedActor } from "@dashboard/lib/auth/unified-actor";
import { ensureTriggerStateWriter } from "@dashboard/lib/user-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ message: "Not available" }, { status: 404 });
  }
  ensureTriggerStateWriter();
  const actor = await resolveUnifiedActor(req);
  if (!actor?.token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  if (!isSystemEventName(body.name)) {
    return NextResponse.json({ message: "Unknown event" }, { status: 400 });
  }

  emitSystemEvent(
    body.name as SystemEventName,
    body.payload as SystemEventPayload<SystemEventName>,
    {
      userId: actor.userId,
      brand: actor.brand,
      source: "server",
      octokit: createUserOctokit(actor.token),
    },
  );
  return new NextResponse(null, { status: 204 });
}
