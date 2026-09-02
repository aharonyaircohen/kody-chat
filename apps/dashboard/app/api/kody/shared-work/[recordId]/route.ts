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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ recordId: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  const { recordId } = await context.params;
  const tenantId = tenantIdFor(auth.owner, auth.repo);
  try {
    const [detail, approvalRequests] = await Promise.all([
      getConvexClient().query(backendApi.sharedWork.get, {
        tenantId,
        recordId,
      }),
      getConvexClient().query(backendApi.mcpApprovalRequests.listForWork, {
        tenantId,
        workRecordId: recordId,
        limit: 100,
      }),
    ]);
    if (!detail)
      return NextResponse.json(
        { error: "shared_work_not_found" },
        { status: 404, headers: HEADERS },
      );
    return NextResponse.json(
      { ...detail, approvalRequests },
      { headers: HEADERS },
    );
  } catch (error) {
    logger.error({ error, tenantId, recordId }, "shared work: detail failed");
    return NextResponse.json(
      { error: "shared_work_read_failed" },
      { status: 500, headers: HEADERS },
    );
  }
}
