/**
 * @fileType utility
 * @domain kody
 * @pattern auth
 * @ai-summary Token-based authentication for the Kody Operations Dashboard.
 *
 * Auth priority:
 * 1. Request headers from client (x-kody-token, x-kody-owner, x-kody-repo)
 * 2. Env vars (KODY_BOT_TOKEN, GITHUB_TOKEN) — server-side only, no client access
 *
 * The client stores credentials in localStorage after login.
 * All API calls pass credentials via custom headers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyKodySession } from '@dashboard/lib/auth/kody_session'
import { createUserOctokit } from '@dashboard/lib/github-client'
import { logger } from '@dashboard/lib/logger'
import type { Octokit } from '@octokit/rest'

// ─── Header constants (must match auth-context.ts buildAuthHeaders) ─────────────

const HDR_TOKEN = 'x-kody-token'
const HDR_OWNER = 'x-kody-owner'
const HDR_REPO = 'x-kody-repo'

// ─── Per-request auth from headers ────────────────────────────────────────────

export interface RequestAuth {
  token: string
  owner: string
  repo: string
}

/**
 * Extract auth from request headers (set by client from localStorage).
 * Returns null if headers are missing or incomplete.
 */
export function getRequestAuth(req: NextRequest): RequestAuth | null {
  const token = req.headers.get(HDR_TOKEN)
  const owner = req.headers.get(HDR_OWNER)
  const repo = req.headers.get(HDR_REPO)

  if (!token || !owner || !repo) return null
  return { token, owner, repo }
}

// ─── Server-side env token (fallback for CI / token-only deployments) ────────

function getEnvToken(): string | null {
  return process.env.KODY_BOT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_PAT || null
}

// ─── Require auth — 401 if neither header token nor env token present ─────────

/**
 * Require auth for a route. Checks:
 * 1. x-kody-token header (client localStorage auth)
 * 2. KODY_BOT_TOKEN / GITHUB_TOKEN env var (server-side fallback)
 *
 * Returns null on success, or a NextResponse on failure.
 */
export async function requireKodyAuth(req: NextRequest): Promise<null | NextResponse> {
  const headerAuth = getRequestAuth(req)
  const envToken = getEnvToken()

  if (!headerAuth && !envToken) {
    return NextResponse.json(
      { message: 'Not authenticated. Provide x-kody-token header or set KODY_BOT_TOKEN env var.' },
      { status: 401 },
    )
  }
  return null
}

// ─── Get Octokit instance ──────────────────────────────────────────────────────

/**
 * Get a per-request Octokit instance.
 *
 * Priority:
 * 1. Client token from x-kody-token header (localStorage auth)
 * 2. Env token fallback (CI / token-only deployments)
 * 3. OAuth session (legacy, from cookie)
 *
 * Callers should prefer the header token so operations are attributed
 * to the actual user rather than the bot account.
 */
export async function getUserOctokit(req: NextRequest): Promise<Octokit | null> {
  // 1. Client header token (localStorage auth)
  const headerAuth = getRequestAuth(req)
  if (headerAuth) {
    return createUserOctokit(headerAuth.token)
  }

  // 2. Env token fallback
  const envToken = getEnvToken()
  if (envToken) {
    return createUserOctokit(envToken)
  }

  // 3. OAuth session (legacy)
  const identity = await verifyKodySession(req)
  if (identity?.ghToken) {
    return createUserOctokit(identity.ghToken)
  }

  return null
}

// ─── Actor login verification ───────────────────────────────────────────────────

/**
 * Verify that the supplied actorLogin matches the authenticated session.
 */
export async function verifyActorLogin(
  req: NextRequest,
  suppliedLogin: string | undefined,
): Promise<{ identity: { login: string; avatar_url: string; githubId: number } } | NextResponse> {
  const authError = await requireKodyAuth(req)
  if (authError !== null) {
    return authError
  }

  const identity = await verifyKodySession(req)

  // Header or env token auth — actorLogin check is skipped
  if (!identity) {
    const headerAuth = getRequestAuth(req)
    const token = headerAuth?.token ?? getEnvToken()
    if (token) {
      logger.info(
        { actorLogin: suppliedLogin, path: req.nextUrl.pathname },
        'Token auth: actorLogin verification skipped',
      )
      return {
        identity: {
          login: suppliedLogin || 'token-user',
          avatar_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
          githubId: 0,
        },
      }
    }
    return NextResponse.json({ message: 'No auth token available' }, { status: 401 })
  }

  if (!suppliedLogin) {
    return { identity }
  }

  const normalizedSupplied = suppliedLogin.toLowerCase()
  const normalizedIdentity = identity.login.toLowerCase()

  if (normalizedSupplied !== normalizedIdentity) {
    logger.warn(
      {
        suppliedLogin,
        authenticatedLogin: identity.login,
        path: req.nextUrl.pathname,
      },
      'ActorLogin mismatch — possible impersonation attempt',
    )
    return NextResponse.json(
      { message: 'Invalid actorLogin: does not match authenticated session' },
      { status: 403 },
    )
  }

  return { identity }
}
