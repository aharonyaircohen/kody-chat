import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireUserAuth } from "@kody-ade/base/auth";
import { verifyOperatorActor } from "@kody-ade/kody-chat-dashboard/auth/operator-actor";
import { z } from "zod";
import {
  backendApi,
  getConvexClient,
  userTenantIdFor,
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
  machineAccess: z.enum(["none", "local", "brain"]).default("none"),
  actorLogin: z.string().trim().min(1).max(100),
  surface: z.enum(["global", "vibe-default"]),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = await requireUserAuth(req);
  if (authError instanceof NextResponse) return authError;
  const actor = await verifyOperatorActor(
    req,
    req.headers.get("x-kody-user-login") ?? undefined,
  );
  if (actor instanceof NextResponse) return actor;

  try {
    const surface =
      req.nextUrl.searchParams.get("surface") === "vibe-default"
        ? "vibe-default"
        : "global";
    const conversations = await getConvexClient().query(
      backendApi.conversations.list,
      { tenantId: userTenantIdFor(actor.identity.githubId), surface },
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
  const authError = await requireUserAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);

  const parsed = createConversationSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const actor = await verifyOperatorActor(req, parsed.data.actorLogin);
  if (actor instanceof NextResponse) return actor;

  const now = new Date().toISOString();
  const tenantId = userTenantIdFor(actor.identity.githubId);
  try {
    await getConvexClient().mutation(backendApi.conversations.create, {
      tenantId,
      conversationId: parsed.data.conversationId,
      surface: parsed.data.surface,
      scope: auth
        ? { kind: "repository", owner: auth.owner, repo: auth.repo }
        : { kind: "global" },
      title: parsed.data.title,
      pinned: false,
      activeAgent: parsed.data.activeAgent,
      runtime: parsed.data.runtime,
      machineAccess: parsed.data.machineAccess,
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
