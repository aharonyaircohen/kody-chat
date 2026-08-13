import { NextRequest, NextResponse } from "next/server";

import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { startAgencyRequest } from "@kody-ade/agency/agency-request-lifecycle";
import { readTodoFile, writeTodoFile } from "@kody-ade/workspace/todos/files";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@kody-ade/workspace/github";
import { dispatchApprovedAgencyWorkflow } from "@dashboard/features/agency/server/approved-agency-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TODO_SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  const { slug } = await params;
  if (!TODO_SLUG.test(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  setGitHubContext(auth.owner, auth.repo, auth.token);
  try {
    const actor = await verifyActorLogin(req, undefined);
    if (actor instanceof NextResponse) return actor;
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }
    const result = await startAgencyRequest(slug, {
      read: async (requestSlug) => {
        const todo = await readTodoFile(requestSlug);
        return todo?.agencyRequest
          ? { slug: todo.slug, state: todo.agencyRequest }
          : null;
      },
      save: async (requestSlug, state) => {
        const todo = await readTodoFile(requestSlug);
        if (!todo) throw new Error("Agency request Todo was not found");
        await writeTodoFile({
          octokit,
          slug: requestSlug,
          title: todo.title,
          description: todo.description,
          items: todo.items,
          createdAt: todo.createdAt,
          frontmatter: todo.frontmatter,
          agencyRequest: state,
          sha: todo.sha,
        });
      },
      dispatch: (execution) =>
        dispatchApprovedAgencyWorkflow({ request: req, execution }),
    });

    if (result.kind === "not-found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.kind === "invalid-phase" || result.kind === "blocked") {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result, {
      status: result.kind === "started" ? 202 : 200,
    });
  } catch (error) {
    console.error("[Agency request run] failed", error);
    return NextResponse.json(
      { error: "agency_request_run_failed" },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
