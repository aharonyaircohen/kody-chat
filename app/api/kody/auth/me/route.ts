/**
 * @fileType api-route
 * @domain kody
 * @pattern auth-api
 *
 * GET /api/kody/auth/me
 *
 * Returns the current GitHub identity from request headers (localStorage auth).
 * Falls back to env token for server-side deployments.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth } from "@dashboard/lib/auth";
import { createUserOctokit } from "@dashboard/lib/github-client";

function getEnvToken(): string | null {
  return process.env.KODY_BOT_TOKEN || process.env.GITHUB_TOKEN || null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. Header auth (localStorage) — fetch real user identity
  const headerAuth = getRequestAuth(req);
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
        owner: headerAuth.owner,
        repo: headerAuth.repo,
      });
    } catch {
      return NextResponse.json(
        { authenticated: false, error: "Invalid token" },
        { status: 401 },
      );
    }
  }

  // 2. Env token fallback (CI / server-side deployments)
  const envToken = getEnvToken();
  if (envToken) {
    return NextResponse.json({
      authenticated: true,
      user: {
        login: "dashboard",
        avatar_url:
          "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        githubId: 0,
      },
    });
  }

  // 3. No auth
  return NextResponse.json({ authenticated: false }, { status: 200 });
}
