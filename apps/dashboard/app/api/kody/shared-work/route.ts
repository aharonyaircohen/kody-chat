import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";
import { logger } from "@kody-ade/base/logger";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "@dashboard/lib/backend/convex-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  const tenantId = tenantIdFor(auth.owner, auth.repo);
  try {
    const records = await getConvexClient().query(backendApi.sharedWork.list, {
      tenantId,
      limit: 100,
    });
    return NextResponse.json({ records }, { headers: HEADERS });
  } catch (error) {
    logger.error({ error, tenantId }, "shared work: list failed");
    return NextResponse.json(
      { error: "shared_work_read_failed" },
      { status: 500, headers: HEADERS },
    );
  }
}
