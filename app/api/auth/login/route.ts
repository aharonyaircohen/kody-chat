/**
 * @fileType api-endpoint
 * @domain auth
 *
 * POST /api/auth/login
 *
 * Validates a GitHub token and repo URL.
 * Checks that the token has the `repo` scope (required for all dashboard operations).
 * Returns the authenticated user info and parsed repo owner/name.
 *
 * Body: { repoUrl: string, token: string }
 * Response: { ok: true, user: { login, avatar_url }, owner, repo } | { ok: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: { repoUrl?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { repoUrl, token } = body;

  if (!repoUrl || !token) {
    return NextResponse.json(
      { ok: false, error: "repoUrl and token are required" },
      { status: 400 },
    );
  }

  // Parse owner/repo from various GitHub URL formats
  // Supports: https://github.com/owner/repo, git@github.com:owner/repo.git, owner/repo
  let owner: string;
  let repo: string;

  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") {
      return NextResponse.json(
        { ok: false, error: "Only github.com repositories are supported" },
        { status: 400 },
      );
    }
    const parts = url.pathname.replace(/^\//, "").split("/").filter(Boolean);
    if (parts.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Invalid repo URL. Expected format: https://github.com/owner/repo" },
        { status: 400 },
      );
    }
    [owner, repo] = parts;
  } catch {
    // Try SSH format: git@github.com:owner/repo.git
    const sshMatch = repoUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
      [, owner, repo] = sshMatch;
    } else {
      // Try owner/repo shorthand
      const shorthandMatch = repoUrl.match(/^([^/]+)\/([^/]+)$/);
      if (shorthandMatch) {
        [, owner, repo] = shorthandMatch;
      } else {
        return NextResponse.json(
          { ok: false, error: "Invalid repo URL. Expected format: https://github.com/owner/repo" },
          { status: 400 },
        );
      }
    }
  }

  // Validate the token by calling GitHub API
  const ghRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!ghRes.ok) {
    if (ghRes.status === 401) {
      return NextResponse.json(
        { ok: false, error: "Invalid token. Check that the token is correct and has not expired." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `GitHub API error: ${ghRes.status} ${ghRes.statusText}` },
      { status: 502 },
    );
  }

  // Check granted scopes — `repo` scope is required for all dashboard operations
  const scopesHeader = ghRes.headers.get("x-oauth-scopes") ?? "";
  const scopes = scopesHeader.split(",").map((s) => s.trim()).filter(Boolean);

  if (!scopes.includes("repo")) {
    return NextResponse.json(
      {
        ok: false,
        error: `Token is missing the 'repo' scope. The dashboard requires full repo access to manage issues, pull requests, and workflows. Please generate a new token at https://github.com/settings/tokens with the 'repo' scope enabled.`,
      },
      { status: 403 },
    );
  }

  const user = (await ghRes.json()) as { login: string; avatar_url: string; id: number };

  return NextResponse.json({
    ok: true,
    user: { login: user.login, avatar_url: user.avatar_url, id: user.id },
    owner,
    repo,
  });
}
