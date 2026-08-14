import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { submitAgencyRequest } from "@kody-ade/agency/agency-request-manager";
import {
  createTodoSlug,
  listTodoFiles,
  writeTodoFile,
} from "@kody-ade/workspace/todos/files";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@kody-ade/workspace/github";
import { readStoreStrategy } from "@dashboard/lib/store-strategies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const submitSchema = z
  .object({
    blueprintId: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,127}$/)
      .optional(),
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("guided-flow"),
          instanceId: z.string().trim().min(1).max(200),
          effectId: z.string().trim().min(1).max(300),
        })
        .strict(),
      z
        .object({
          kind: z.literal("store-blueprint"),
          blueprintId: z
            .string()
            .trim()
            .regex(/^[a-z][a-z0-9-]{0,127}$/),
          requestId: z.string().trim().min(1).max(300),
        })
        .strict(),
    ]),
    answers: z.record(z.string(), z.unknown()),
  })
  .strict();

export async function POST(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }

  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const parsed = submitSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation_error", details: parsed.error.issues },
        { status: 400 },
      );
    }
    const actorResult = await verifyActorLogin(req, undefined);
    if (actorResult instanceof NextResponse) return actorResult;
    const octokit = await getUserOctokit(req);
    if (!octokit) {
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    }

    const result = await submitAgencyRequest(parsed.data, {
      findBySource: async (source) => {
        const todos = await listTodoFiles();
        const existing = todos.find(
          (todo) => {
            const candidate = todo.agencyRequest?.source;
            if (!candidate || candidate.kind !== source.kind) return false;
            return source.kind === "guided-flow"
              ? candidate.kind === "guided-flow" &&
                  candidate.effectId === source.effectId &&
                  candidate.instanceId === source.instanceId
              : candidate.kind === "store-blueprint" &&
                  candidate.blueprintId === source.blueprintId &&
                  candidate.requestId === source.requestId;
          },
        );
        return existing ? { slug: existing.slug } : null;
      },
      create: async (draft) => {
        const now = new Date().toISOString();
        const slug = await createTodoSlug(draft.title);
        const todo = await writeTodoFile({
          octokit,
          slug,
          title: draft.title,
          description: draft.description,
          items: draft.items.map((item, index) => ({
            id: `request-${index + 1}`,
            title: item.title,
            body: item.body,
            assignee: null,
            completed: item.completed,
            createdAt: now,
            completedAt: item.completed ? now : null,
            meta: item.meta,
          })),
          createdAt: now,
          agencyRequest: draft.agencyRequest,
        });
        return { slug: todo.slug };
      },
      resolveBlueprint: (id) => readStoreStrategy(octokit, id),
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("[Agency requests] submit failed", error);
    return NextResponse.json(
      { error: "agency_request_submit_failed" },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
