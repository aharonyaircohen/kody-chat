import { NextRequest, NextResponse } from "next/server";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json({ error: "repository_required" }, { status: 400 });
  const requested = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(100, Math.floor(requested)))
    : 50;
  try {
    const result = await createBackendClient().query(
      backendApi.agentRuns.listDetailed,
      {
        tenantId: `${auth.owner}/${auth.repo}`,
        limit,
        now: new Date().toISOString(),
      },
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "agent_activity_unavailable" },
      { status: 503 },
    );
  }
}
