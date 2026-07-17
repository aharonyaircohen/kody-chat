/**
 * @fileType api-endpoint
 * @domain kody
 * @pattern agent-api
 * @ai-summary Agent Control API — GET lists agent, POST creates one.
 *   An agent is a markdown file at `agents/<slug>.md` in the state repo.
 *   Duplicated from the capabilities API; the manual "Run now"
 *   path reuses the engine's `capability-tick` plumbing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireKodyAuth,
  verifyActorLogin,
  getUserOctokit,
  getRequestAuth,
} from "@kody-ade/base/auth";
import {
  setGitHubContext,
  clearGitHubContext,
} from "../github";
import {
  listResolvedAgentFiles,
  writeAgentFile,
  isValidSlug,
  readAgentFile,
} from "../agent-files";
import { normalizeAgentSlug } from "../agent-slug";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { recordAudit } from "@kody-ade/base/activity/audit";
import {
  listProjectedAgents,
  saveProjectedAgent,
} from "../backend/agents-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (headerAuth)
    setGitHubContext(
      headerAuth.owner,
      headerAuth.repo,
      headerAuth.token,
      headerAuth.storeRepoUrl,
      headerAuth.storeRef,
    );

  try {
    if (headerAuth) {
      try {
        const projected = await listProjectedAgents(
          headerAuth.owner,
          headerAuth.repo,
        );
        if (projected.length > 0) {
          return NextResponse.json(
            { agent: projected },
            { headers: NO_STORE_HEADERS },
          );
        }
      } catch {
        // Bootstrap from GitHub below.
      }
    }
    const activeAgents = new Set<string>();
    const octokit = await getUserOctokit(req);
    if (octokit && headerAuth) {
      const { config } = await getEngineConfig(
        octokit,
        headerAuth.owner,
        headerAuth.repo,
      );
      for (const slug of config.company?.activeAgents ?? []) {
        activeAgents.add(slug);
      }
    }
    const agent = (await listResolvedAgentFiles()).filter(
      (item) => item.source !== "store" || activeAgents.has(item.slug),
    );
    if (headerAuth) {
      await Promise.all(
        agent.map((item) =>
          saveProjectedAgent(headerAuth.owner, headerAuth.repo, item).catch(
            () => undefined,
          ),
        ),
      );
    }
    return NextResponse.json({ agent }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("[Agent] Error fetching agent:", error);

    if (error?.status === 401) {
      return NextResponse.json(
        { error: "github_token_expired" },
        { status: 401, headers: NO_STORE_HEADERS },
      );
    }
    if (error?.status === 403 || error?.message?.includes("rate limit")) {
      return NextResponse.json(
        { error: "rate_limited", message: "GitHub API rate limit exceeded" },
        { status: 429, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { agent: [], error: error?.message || "Failed to fetch agent" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  } finally {
    clearGitHubContext();
  }
}

const createAgentSchema = z.object({
  slug: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().max(64).optional(),
  ),
  title: z.string().min(1),
  body: z.string().default(""),
  capabilities: z.array(z.string()).max(50).optional(),
  actorLogin: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const headerAuth = getRequestAuth(req);
  if (headerAuth)
    setGitHubContext(
      headerAuth.owner,
      headerAuth.repo,
      headerAuth.token,
      headerAuth.storeRepoUrl,
      headerAuth.storeRef,
    );

  try {
    const payload = await req.json();
    const {
      slug: requestedSlug,
      title,
      body,
      capabilities,
      actorLogin,
    } = createAgentSchema.parse(payload);

    const slug = normalizeAgentSlug(requestedSlug ?? title);
    if (!slug || !isValidSlug(slug)) {
      return NextResponse.json(
        {
          error: "invalid_slug",
          message:
            "Agent slug must be lowercase letters, digits, dashes, or underscores.",
        },
        { status: 400 },
      );
    }

    const existing = await readAgentFile(slug);
    if (existing) {
      return NextResponse.json(
        {
          error: "slug_taken",
          message: `Agent member "${slug}" already exists.`,
        },
        { status: 409 },
      );
    }

    const actorResult = await verifyActorLogin(req, actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;

    const userOctokit = await getUserOctokit(req);
    if (!userOctokit) {
      return NextResponse.json(
        {
          error: "no_user_token",
          message:
            "A signed-in GitHub token is required to commit agent files.",
        },
        { status: 401 },
      );
    }

    const agentMember = await writeAgentFile({
      octokit: userOctokit,
      slug,
      title,
      body,
      ...(capabilities ? { capabilities } : {}),
    });

    recordAudit(req, {
      action: "agent.create",
      resource: slug,
      agent: slug,
      detail: `created agent "${title}"`,
    });

    return NextResponse.json({ agentMember });
  } catch (error: any) {
    console.error("[Agent] Error creating agent:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", details: error.issues },
        { status: 400 },
      );
    }

    if (error?.status === 401) {
      return NextResponse.json(
        { error: "github_token_expired" },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        error: "create_failed",
        message: error?.message ?? "Failed to create agent",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
