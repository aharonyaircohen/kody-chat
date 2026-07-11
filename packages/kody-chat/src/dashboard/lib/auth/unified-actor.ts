/**
 * @fileType utility
 * @domain auth
 * @pattern unified-actor
 * @ai-summary Resolves "who is this request from" across the two auth
 *   systems: dashboard operators (header PAT) and brand client users
 *   (NextAuth session). Returns a stable userId (`operator:<login>` /
 *   `client:<email>`) plus the brand context — the identity used by
 *   system events and user-state. Never trusts client-claimed identity:
 *   operator login comes from headers set alongside the PAT, client email
 *   from the signed session cookie.
 */
import "server-only";
import type { NextRequest } from "next/server";
import { getRequestAuth } from "@kody-ade/base/auth";
import { auth as clientAuth } from "@dashboard/lib/client-auth/auth";
import {
  CLIENT_BRAND_REPO_COOKIE,
  parseClientBrandRepoCookie,
} from "@dashboard/lib/client-brand-repo-cookie";
import type { SystemEventBrand } from "@kody-ade/base/events/types";

export type UnifiedActorKind = "operator" | "client";

export interface UnifiedActor {
  /** Stable id: `operator:<login>` or `client:<email>`. */
  userId: string;
  kind: UnifiedActorKind;
  brand: SystemEventBrand | null;
  /** Operator PAT when kind is "operator" — used for state-repo access. */
  token: string | null;
}

/**
 * Resolve the acting user for a request. Operator headers win over a client
 * session (a dashboard operator may also carry a client cookie).
 */
export async function resolveUnifiedActor(
  req: NextRequest,
): Promise<UnifiedActor | null> {
  const operator = getRequestAuth(req);
  if (operator) {
    return {
      userId: `operator:${(operator.userLogin ?? "unknown").toLowerCase()}`,
      kind: "operator",
      brand: { owner: operator.owner, repo: operator.repo },
      token: operator.token,
    };
  }

  try {
    const session = await clientAuth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) return null;
    const brand = parseClientBrandRepoCookie(
      req.cookies.get(CLIENT_BRAND_REPO_COOKIE)?.value,
    );
    return {
      userId: `client:${email}`,
      kind: "client",
      brand,
      token: null,
    };
  } catch {
    return null;
  }
}
