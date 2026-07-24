import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { api } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { createLoopDefinition } from "@kody-ade/agency-domain";

const PREFIX = "loop:";
const trigger = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({
    type: z.literal("schedule"),
    every: z.string().trim().min(1),
    at: z
      .object({
        time: z.string().trim().min(1),
        timezone: z.string().trim().min(1),
      })
      .optional(),
  }),
  z.object({ type: z.literal("event"), event: z.string().trim().min(1) }),
  z.object({ type: z.literal("webhook"), event: z.string().trim().min(1) }),
  z.object({
    type: z.literal("condition"),
    expression: z.string().trim().min(1),
  }),
]);
const payload = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,127}$/),
  trigger,
  target: z.object({
    kind: z.enum(["workflow", "capability"]),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,127}$/),
  }),
  input: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

function tenant(req: NextRequest) {
  const auth = getRequestAuth(req);
  return auth ? `${auth.owner}/${auth.repo}` : null;
}

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const tenantId = tenant(req);
  if (!tenantId) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const records = (await createBackendClient().query(
    api.repoDocs.listByPrefix,
    { tenantId, prefix: PREFIX },
  )) as Array<{ kind: string; doc: unknown; updatedAt: string }>;
  const loops = records.flatMap((record) => {
    try {
      return [
        {
          ...createLoopDefinition(record.doc),
          updatedAt: record.updatedAt,
        },
      ];
    } catch {
      return [];
    }
  });
  return NextResponse.json({ loops });
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const tenantId = tenant(req);
  if (!tenantId) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  try {
    const loop = createLoopDefinition(payload.parse(await req.json()));
    const existing = await createBackendClient().query(api.repoDocs.get, {
      tenantId,
      kind: `${PREFIX}${loop.id}`,
    });
    if (existing) {
      return NextResponse.json({ error: "loop_exists" }, { status: 409 });
    }
    const updatedAt = new Date().toISOString();
    await createBackendClient().mutation(api.repoDocs.save, {
      tenantId,
      kind: `${PREFIX}${loop.id}`,
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
