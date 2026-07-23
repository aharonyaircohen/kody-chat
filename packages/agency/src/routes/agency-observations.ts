import { NextRequest, NextResponse } from "next/server";

import { listStoredAgencyRuns } from "../backend/agency-runs-store";
import { listStoredAgencyOutputs } from "../backend/agency-model-store";
import { verifyRepoWriteAccess } from "./repo-write-access";

function limit(req: NextRequest, name: string, fallback: number, max: number) {
  const parsed = Number.parseInt(
    req.nextUrl.searchParams.get(name) ?? String(fallback),
    10,
  );
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(max, parsed))
    : fallback;
}

export async function GET(req: NextRequest) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  try {
    const [runs, outputs] = await Promise.all([
      listStoredAgencyRuns(
        access.auth.owner,
        access.auth.repo,
        limit(req, "runs", 200, 500),
      ),
      listStoredAgencyOutputs(
        access.auth.owner,
        access.auth.repo,
        limit(req, "outputs", 500, 1000),
      ),
    ]);
    return NextResponse.json(
      { runs, outputs },
      { headers: { "Cache-Control": "private, max-age=15" } },
    );
  } catch {
    return NextResponse.json(
      { error: "agency_observations_failed" },
      { status: 500 },
    );
  }
}
