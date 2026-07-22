/**
 * @fileType api-endpoint
 * @domain client-auth
 * @pattern signin-kickoff
 * @ai-summary Start a client-surface OAuth sign-in. The brand page redirects
 *   here (instead of calling `signIn()` during render) because the NextAuth
 *   lazy config needs a real request to learn which repo's credentials to
 *   load — the repo-qualified `redirectTo` on this request carries it.
 */
import { NextRequest } from "next/server";

import { signIn } from "../../../../src/dashboard/lib/client-auth/auth";
import { isSupportedProviderId } from "../../../../src/dashboard/lib/client-auth/catalog";

export const runtime = "nodejs";

/** Only same-origin client-surface paths may be used as the return target. */
function safeRedirectTo(value: string | null): string {
  return value && /^\/client\/[^\s]*$/.test(value) ? value : "/";
}

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") ?? "";
  const redirectTo = safeRedirectTo(req.nextUrl.searchParams.get("redirectTo"));
  if (!isSupportedProviderId(provider)) {
    return new Response("Unknown provider", { status: 400 });
  }
  // Throws NEXT_REDIRECT to the provider's authorization page.
  await signIn(provider, { redirectTo });
}
