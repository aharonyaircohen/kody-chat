import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { createLoopDefinition } from "@kody-ade/agency-domain";
import {
  listRepositoryLoops,
  readRepositoryLoop,
  saveRepositoryLoop,
} from "@dashboard/lib/repository-loops";

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

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const loops = (await listRepositoryLoops(
    octokit,
    auth.owner,
    auth.repo,
  )).map((loop) => ({ ...loop, updatedAt: "" }));
  return NextResponse.json({ loops });
}

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  try {
    const loop = createLoopDefinition(payload.parse(await req.json()));
    const existing = await readRepositoryLoop(
      octokit,
      auth.owner,
      auth.repo,
      loop.id,
    );
    if (existing) {
      return NextResponse.json({ error: "loop_exists" }, { status: 409 });
    }
    const updatedAt = "";
    await saveRepositoryLoop(
      octokit,
      auth.owner,
      auth.repo,
      loop,
      `chore(kody): add loop ${loop.id}`,
    );
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
