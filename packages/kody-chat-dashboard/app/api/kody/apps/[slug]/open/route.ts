import { NextRequest, NextResponse } from "next/server";
import { verifyRepoReadAccess } from "@kody-ade/base/auth";
import { api as backendApi } from "@kody-ade/backend/api";
import { createBackendClient } from "@kody-ade/backend/client";
import { mintAppLaunchTicket } from "@kody-ade/fly/apps/access-ticket";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await verifyRepoReadAccess(req);
  if (access instanceof NextResponse) return access;
  const tenantId = `${access.auth.owner}/${access.auth.repo}`,
    { slug } = await params,
    app = await createBackendClient().query(backendApi.apps.get, {
      tenantId,
      slug,
    });
  if (!app)
    return NextResponse.json({ error: "app_not_found" }, { status: 404 });
  if (!app.provider.publicUrl)
    return NextResponse.json({ error: "app_url_unavailable" }, { status: 409 });
  const url = new URL(app.provider.publicUrl);
  if (app.exposure === "private")
    url.searchParams.set("ka", mintAppLaunchTicket(tenantId, app.appId).ticket);
  return NextResponse.redirect(url, 302);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const response = await resolveLaunch(req, context);
  if (response instanceof NextResponse) return response;
  return NextResponse.json(
    { url: response.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function resolveLaunch(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<URL | NextResponse> {
  const access = await verifyRepoReadAccess(req);
  if (access instanceof NextResponse) return access;
  const tenantId = `${access.auth.owner}/${access.auth.repo}`,
    { slug } = await params,
    app = await createBackendClient().query(backendApi.apps.get, {
      tenantId,
      slug,
    });
  if (!app)
    return NextResponse.json({ error: "app_not_found" }, { status: 404 });
  if (!app.provider.publicUrl)
    return NextResponse.json({ error: "app_url_unavailable" }, { status: 409 });
  const url = new URL(app.provider.publicUrl);
  if (app.exposure === "private")
    url.searchParams.set("ka", mintAppLaunchTicket(tenantId, app.appId).ticket);
  return url;
}
