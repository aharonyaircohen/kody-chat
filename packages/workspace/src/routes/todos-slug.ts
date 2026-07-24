import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { clearGitHubContext, setGitHubContext } from "../github";
import {
  deleteTodoFile,
  isValidTodoSlug,
  readTodoFile,
  writeTodoFile,
} from "../todos/files";

const checklistItem = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(20_000),
  done: z.boolean(),
});
const updateTodo = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    outcome: z.string().max(20_000).optional(),
    status: z.enum(["todo", "in-progress", "blocked", "done"]).optional(),
    evidence: z.array(z.string().trim().min(1).max(20_000)).max(200).optional(),
    checklist: z.array(checklistItem).max(200).optional(),
    blockers: z.array(z.string().trim().min(1).max(20_000)).max(200).optional(),
    runIds: z.array(z.string().trim().min(1).max(160)).max(200).optional(),
    actorLogin: z.string().optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "actorLogin"),
    "At least one Todo field is required",
  );

async function context(req: NextRequest) {
  const auth = await requireKodyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const requestAuth = getRequestAuth(req);
  if (requestAuth) {
    setGitHubContext(requestAuth.owner, requestAuth.repo, requestAuth.token);
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const error = await context(req);
  if (error) return error;
  try {
    const { slug } = await params;
    if (!isValidTodoSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const todo = await readTodoFile(slug);
    return todo
      ? NextResponse.json({ todo })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } finally {
    clearGitHubContext();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const error = await context(req);
  if (error) return error;
  try {
    const { slug } = await params;
    if (!isValidTodoSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const parsed = updateTodo.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error" }, { status: 400 });
    }
    const actor = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actor instanceof NextResponse) return actor;
    const existing = await readTodoFile(slug);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }
    const { actorLogin: _actorLogin, ...patch } = parsed.data;
    const { slug: _slug, path: _path, sha: _sha, htmlUrl: _htmlUrl, ...todo } =
      existing;
    return NextResponse.json({
      todo: await writeTodoFile({
        octokit,
        slug,
        todo: { ...todo, ...patch },
      }),
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error: "todo_update_failed",
        message: cause instanceof Error ? cause.message : "Unknown error",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const error = await context(req);
  if (error) return error;
  try {
    const { slug } = await params;
    if (!isValidTodoSlug(slug)) {
      return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
    }
    const actor = await verifyActorLogin(
      req,
      req.nextUrl.searchParams.get("actorLogin") ?? undefined,
    );
    if (actor instanceof NextResponse) return actor;
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }
    await deleteTodoFile(octokit, slug);
    return NextResponse.json({ success: true });
  } finally {
    clearGitHubContext();
  }
}
