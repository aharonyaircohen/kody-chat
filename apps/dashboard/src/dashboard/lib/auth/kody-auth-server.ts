import "server-only";

import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { headers } from "next/headers";

function convexSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();
  if (explicit) return explicit;
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!cloudUrl) return "http://127.0.0.1:3211";
  return cloudUrl.replace(/\.cloud$/, ".site");
}

export const {
  handler: kodyAuthHandler,
  fetchAuthQuery,
  getToken: getKodyAuthToken,
  isAuthenticated: isKodyAuthenticated,
} = convexBetterAuthNextJs({
  convexUrl:
    process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210",
  convexSiteUrl: convexSiteUrl(),
});

export async function getCurrentKodySessionUser(): Promise<{
  id: string;
  name?: string | null;
  email?: string | null;
} | null> {
  const requestHeaders = new Headers(await headers());
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  // Convex is optional — when NEXT_PUBLIC_CONVEX_URL is unset (PW_LOCAL E2E)
  // the Better Auth handler fetches a non-existent backend and throws.
  // Treat unreachable auth as "no session" instead of crashing the route.
  let response: Response;
  try {
    response = await kodyAuthHandler.GET(
      new Request(`${protocol}://${host}/api/auth/get-session`, {
        headers: requestHeaders,
      }),
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    user?: { id?: unknown; name?: unknown; email?: unknown };
  } | null;
  if (typeof payload?.user?.id !== "string") return null;
  return {
    id: payload.user.id,
    ...(typeof payload.user.name === "string"
      ? { name: payload.user.name }
      : {}),
    ...(typeof payload.user.email === "string"
      ? { email: payload.user.email }
      : {}),
  };
}
