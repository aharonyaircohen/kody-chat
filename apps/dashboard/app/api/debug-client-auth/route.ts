// TEMPORARY debug endpoint — booleans only, no secret values. Remove after use.
import { NextResponse } from "next/server";
import { resolveBackgroundToken } from "@kody-ade/base/auth/background-token";
import { resolveClientBrand } from "@kody-ade/kody-chat-dashboard/client-brand";
import { resolveConfiguredProviders } from "@kody-ade/kody-chat-dashboard/client-auth/credentials";

export const runtime = "nodejs";

export async function GET() {
  const owner = "A-Guy-educ";
  const repo = "A-Guy-Web";
  const background = await resolveBackgroundToken(owner, repo);
  const context = {
    owner,
    repo,
    ...(background ? { token: background.token } : {}),
  };
  const brand = await resolveClientBrand("aguy", context);
  const providers = brand?.auth
    ? await resolveConfiguredProviders(["google"], context)
    : [];
  return NextResponse.json({
    tokenSource: background?.source ?? null,
    brandFound: !!brand,
    brandAuthRequired: brand?.auth?.required ?? null,
    googleConfigured: providers.includes("google"),
  });
}
