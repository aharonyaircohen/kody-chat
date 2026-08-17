import "server-only";

import { NextResponse } from "next/server";
import { backendApi } from "@dashboard/lib/backend/convex-backend";
import { fetchAuthQuery } from "./kody-auth-server";

export type KodyUser = Readonly<{
  id: string;
  label: string;
  email?: string;
}>;

export async function requireKodyUser(): Promise<KodyUser | NextResponse> {
  const identity = await fetchAuthQuery(backendApi.auth.currentUser, {});
  if (!identity) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return {
    id: identity.subject,
    label: identity.name ?? identity.email ?? "Kody user",
    ...(identity.email ? { email: identity.email } : {}),
  };
}
