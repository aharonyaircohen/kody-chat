import { NextRequest, NextResponse } from "next/server";

import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { getRequestAuth, requireKodyAuth } from "@kody-ade/base/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const headers = { "Cache-Control": "no-store, max-age=0" };

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ resource: string; slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError) return authError;
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "missing_repo_context" },
      { status: 400, headers },
    );
  }
  const tenantId = `${auth.owner}/${auth.repo}`;
  const { resource, slug } = await context.params;
  const operation =
    resource === "actions"
      ? backendApi.quality.removeAction
      : resource === "journeys"
        ? backendApi.quality.removeJourney
        : resource === "scenarios"
          ? backendApi.quality.removeScenario
          : null;
  if (!operation) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  try {
    const removed = await createBackendClient().mutation(operation, {
      tenantId,
      slug,
    });
    if (!removed) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    }
    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("[quality] delete blocked", { resource, slug, error });
    return NextResponse.json(
      { error: "quality_definition_referenced" },
      { status: 409, headers },
    );
  }
}
