import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { clearGitHubContext, setGitHubContext } from "../github";
import { createTodoSlug, listTodoFiles, writeTodoFile } from "../todos/files";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const checklistItem = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(20_000),
  done: z.boolean(),
});
const createTodo = z.object({
  title: z.string().trim().min(1).max(160),
  outcome: z.string().max(20_000).default(""),
  status: z.enum(["todo", "in-progress", "blocked", "done"]).default("todo"),
  evidence: z.array(z.string().trim().min(1).max(20_000)).max(200).default([]),
  checklist: z.array(checklistItem).max(200).default([]),
  blockers: z.array(z.string().trim().min(1).max(20_000)).max(200).default([]),
  runIds: z.array(z.string().trim().min(1).max(160)).max(200).default([]),
  actorLogin: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireKodyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const context = getRequestAuth(req);
  if (context) setGitHubContext(context.owner, context.repo, context.token);
  try {
    return NextResponse.json(
      { todos: await listTodoFiles() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "todo_list_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireKodyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const context = getRequestAuth(req);
  if (context) setGitHubContext(context.owner, context.repo, context.token);
  try {
    const parsed = createTodo.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error" }, { status: 400 });
    }
    const actor = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actor instanceof NextResponse) return actor;
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }
    const now = new Date().toISOString();
    const { actorLogin: _actorLogin, ...todo } = parsed.data;
    const slug = await createTodoSlug(todo.title);
    return NextResponse.json({
      todo: await writeTodoFile({
        octokit,
        slug,
        todo: { ...todo, createdAt: now, updatedAt: now },
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "todo_create_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
