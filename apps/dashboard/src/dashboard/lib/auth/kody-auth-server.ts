import "server-only";

import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

function convexSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim();
  if (explicit) return explicit;
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!cloudUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  return cloudUrl.replace(/\.cloud$/, ".site");
}

export const {
  handler: kodyAuthHandler,
  fetchAuthQuery,
  getToken: getKodyAuthToken,
  isAuthenticated: isKodyAuthenticated,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: convexSiteUrl(),
});
