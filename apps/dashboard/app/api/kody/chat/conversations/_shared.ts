import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireUserAuth } from "@kody-ade/base/auth";
import { verifyOperatorActor } from "@kody-ade/kody-chat-dashboard/auth/operator-actor";
import { userTenantIdFor } from "@dashboard/lib/backend/convex-backend";

export type ConversationRequestContext = Readonly<{
  owner?: string;
  repo?: string;
  tenantId: string;
  actorLogin: string;
  actorGithubId: number;
}>;

export async function requireConversationContext(
  req: NextRequest,
): Promise<ConversationRequestContext | NextResponse> {
  const authError = await requireUserAuth(req);
  if (authError instanceof NextResponse) return authError;
  const actor = await verifyOperatorActor(
    req,
    req.headers.get("x-kody-user-login") ?? undefined,
  );
  if (actor instanceof NextResponse) return actor;
  const auth = getRequestAuth(req);
  return {
    ...(auth ? { owner: auth.owner, repo: auth.repo } : {}),
    tenantId: userTenantIdFor(actor.identity.githubId),
    actorLogin: actor.identity.login,
    actorGithubId: actor.identity.githubId,
  };
}

export function invalidBody(issues: unknown): NextResponse {
  return NextResponse.json({ error: "invalid_body", issues }, { status: 400 });
}
