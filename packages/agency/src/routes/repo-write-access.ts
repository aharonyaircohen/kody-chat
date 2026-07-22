import { NextRequest, NextResponse } from "next/server";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  type RequestAuth,
} from "@kody-ade/base/auth";

export type VerifiedRepoWriter = {
  auth: RequestAuth;
  actorLogin: string;
};

export async function verifyRepoWriteAccess(
  req: NextRequest,
): Promise<VerifiedRepoWriter | NextResponse> {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const octokit = await getUserOctokit(req);
  if (!auth || !octokit) {
    return NextResponse.json(
      { error: "request_auth_required" },
      { status: 401 },
    );
  }
  try {
    const { data: actor } = await octokit.rest.users.getAuthenticated();
    const { data: access } =
      await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: auth.owner,
        repo: auth.repo,
        username: actor.login,
      });
    if (!["admin", "maintain", "write"].includes(access.permission)) {
      return NextResponse.json(
        { error: "write_permission_required" },
        { status: 403 },
      );
    }
    return { auth, actorLogin: actor.login };
  } catch {
    return NextResponse.json(
      { error: "github_identity_verification_failed" },
      { status: 403 },
    );
  }
}
