import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { createLoopDefinition } from "@kody-ade/agency-domain";
import {
  deleteRepositoryLoop,
  readRepositoryLoop,
  saveRepositoryLoop,
} from "@dashboard/lib/repository-loops";
import { syncLoopWakeRegistration } from "@dashboard/features/agency/server/loop-wake-registration";

function isLegacyEventTrigger(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "event" || type === "webhook" || type === "condition";
}

function context(req: NextRequest, id: string) {
  const auth = getRequestAuth(req);
  if (!auth || !/^[a-z][a-z0-9-]{0,127}$/.test(id)) return null;
  return auth;
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
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_octokit" }, { status: 401 });
    }
    const body = await req.json();
    const loop = createLoopDefinition({ ...body, id });
    const existing = await readRepositoryLoop(
      octokit,
      resolved.owner,
      resolved.repo,
      id,
    );
    if (
      isLegacyEventTrigger(loop.trigger) &&
      existing?.trigger.type !== loop.trigger.type
    ) {
      return NextResponse.json(
        {
          error: "event_triggers_use_workflow_rules",
          message:
            "GitHub and event-driven starts are configured as event rules, not Loops.",
        },
        { status: 400 },
      );
    }
    const updatedAt = "";
    await syncLoopWakeRegistration({
      owner: resolved.owner,
      repo: resolved.repo,
      loop,
    });
    await saveRepositoryLoop(
      octokit,
      resolved.owner,
      resolved.repo,
      loop,
      `chore(kody): update loop ${id}`,
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
  const octokit = await getUserOctokit(req);
  if (!octokit) {
    return NextResponse.json({ error: "no_octokit" }, { status: 401 });
  }
  await deleteRepositoryLoop(
    octokit,
    resolved.owner,
    resolved.repo,
    id,
    `chore(kody): remove loop ${id}`,
  );
  await syncLoopWakeRegistration({
    owner: resolved.owner,
    repo: resolved.repo,
    loopId: id,
  });
  return NextResponse.json({ success: true });
}
