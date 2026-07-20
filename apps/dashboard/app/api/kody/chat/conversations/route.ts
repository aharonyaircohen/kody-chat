import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { z } from "zod";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";
import { logger } from "@kody-ade/base/logger";

export const runtime = "nodejs";

const agentSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
});

const runtimeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("direct"),
    modelId: z.string().trim().min(1).max(200),
  }),
  z.object({
    kind: z.literal("brain"),
    brainId: z.string().trim().min(1).max(200),
  }),
  z.object({
    kind: z.literal("engine"),
    profileId: z.string().trim().min(1).max(200),
  }),
  z.object({
    kind: z.literal("live"),
    profileId: z.string().trim().min(1).max(200),
  }),
]);

const createConversationSchema = z.object({
  conversationId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  activeAgent: agentSchema,
  runtime: runtimeSchema,
  actorLogin: z.string().trim().min(1).max(100),
  surface: z.enum(["global", "vibe-default"]),
});

function requireRepositoryContext(req: NextRequest) {
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  return auth;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = requireRepositoryContext(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const surface =
      req.nextUrl.searchParams.get("surface") === "vibe-default"
        ? "vibe-default"
        : "global";
    const conversations = await getConvexClient().query(
      backendApi.conversations.list,
      { tenantId: tenantIdFor(auth.owner, auth.repo), surface },
    );
    return NextResponse.json(
      { conversations },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ error }, "conversation list failed");
    return NextResponse.json(
      { error: "conversation_list_failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = requireRepositoryContext(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = createConversationSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const actor = await verifyActorLogin(req, parsed.data.actorLogin);
  if (actor instanceof NextResponse) return actor;

  const now = new Date().toISOString();
  const tenantId = tenantIdFor(auth.owner, auth.repo);
  try {
    await getConvexClient().mutation(backendApi.conversations.create, {
      tenantId,
      conversationId: parsed.data.conversationId,
      surface: parsed.data.surface,
      scope: { kind: "repository", owner: auth.owner, repo: auth.repo },
      title: parsed.data.title,
      pinned: false,
      activeAgent: parsed.data.activeAgent,
      runtime: parsed.data.runtime,
      createdBy: `github:${actor.identity.login}`,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json(
      { conversationId: parsed.data.conversationId },
      { status: 201 },
    );
  } catch (error) {
    logger.error(
      { error, conversationId: parsed.data.conversationId },
      "conversation create failed",
    );
    return NextResponse.json(
      { error: "conversation_create_failed" },
      { status: 500 },
    );
  }
}
