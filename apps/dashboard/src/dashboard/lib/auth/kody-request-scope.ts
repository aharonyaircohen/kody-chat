import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getRequestAuth } from "@kody-ade/base/auth";
import { userTenantIdFor } from "@dashboard/lib/backend/convex-backend";
import { repositoryScopeFor, personalScopeFor } from "@dashboard/lib/kody-scope";
import { requireKodyUser } from "./kody-user";

export async function resolveKodyRequestScope(req: NextRequest) {
  const user = await requireKodyUser();
  if (user instanceof NextResponse) return user;

  const repository = getRequestAuth(req);
  const personalTenantId = userTenantIdFor(user.id);
  if (!repository) {
    return {
      user,
      scope: personalScopeFor(user.id),
      tenantId: personalTenantId,
      personalTenantId,
      repository: null,
    } as const;
  }

  return {
    user,
    scope: repositoryScopeFor(
      user.id,
      repository.owner,
      repository.repo,
    ),
    tenantId: `${repository.owner}/${repository.repo}`,
    personalTenantId,
    repository,
  } as const;
}
