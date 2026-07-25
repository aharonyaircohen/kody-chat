import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
} from "@kody-ade/base/auth";
import { createLoopDefinition } from "@kody-ade/agency-domain";
import {
  deleteRepositoryLoop,
  saveRepositoryLoop,
} from "@dashboard/lib/repository-loops";

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
    const loop = createLoopDefinition({ ...(await req.json()), id });
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_octokit" }, { status: 401 });
    }
    const updatedAt = "";
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
  return NextResponse.json({ success: true });
}
