import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { tenantIdFor } from "@dashboard/lib/backend/convex-backend";

export type ConversationRequestContext = Readonly<{
  owner: string;
  repo: string;
  tenantId: string;
}>;

export async function requireConversationContext(
  req: NextRequest,
): Promise<ConversationRequestContext | NextResponse> {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  }
  return {
    owner: auth.owner,
    repo: auth.repo,
    tenantId: tenantIdFor(auth.owner, auth.repo),
  };
}

export function invalidBody(issues: unknown): NextResponse {
  return NextResponse.json({ error: "invalid_body", issues }, { status: 400 });
}
