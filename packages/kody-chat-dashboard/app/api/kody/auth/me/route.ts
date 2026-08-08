/**
 * @fileType api-route
 * @domain kody
 * @pattern auth-api
 *
 * GET /api/kody/auth/me
 *
 * Returns the current GitHub identity from request headers (localStorage auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { getUserRequestAuth } from "@kody-ade/base/auth";
import { createUserOctokit } from "../../../../../src/dashboard/lib/github-client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const headerAuth = getUserRequestAuth(req);
  if (headerAuth) {
    const octokit = await createUserOctokit(headerAuth.token);
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      return NextResponse.json({
        authenticated: true,
        user: {
          login: user.login,
          avatar_url: user.avatar_url,
          githubId: user.id,
        },
      });
    } catch {
      return NextResponse.json(
        { authenticated: false, error: "Invalid token" },
        { status: 401 },
      );
    }
  }

  return NextResponse.json({ authenticated: false }, { status: 200 });
}
