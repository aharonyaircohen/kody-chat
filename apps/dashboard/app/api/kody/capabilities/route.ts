/**
 * @fileType api-endpoint
 * @domain capabilities
 * @pattern capabilities-api
 * @ai-summary Capabilities Control API backed by the tenant Convex catalog.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireKodyAuth,
  verifyActorLogin,
  getRequestAuth,
} from "@kody-ade/base/auth";
import {
  setGitHubContext,
  clearGitHubContext,
} from "@dashboard/lib/github-client";
import { isValidSlug, PERMISSION_MODES } from "@dashboard/lib/capabilities";
import { getProjectedEngineConfig } from "@dashboard/lib/backend/repo-projection";
import {
  listProjectedCapabilities,
  saveProjectedCapability,
  getProjectedCapability,
} from "@dashboard/lib/backend/repo-projection";
import { recordAudit } from "@dashboard/lib/activity/audit";
import { resolveInstalledCapabilitySlugs } from "@dashboard/lib/company-store/installed-capabilities";

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
    let activeCapabilities = new Set<string>();
    let defaults = { issue: null as string | null, pr: null as string | null };
    if (!headerAuth) return NextResponse.json({ error: "repository_context_required" }, { status: 400, headers: NO_STORE_HEADERS });
    const { config } = await getProjectedEngineConfig({} as never, headerAuth.owner, headerAuth.repo);
    defaults = { issue: config.defaultImplementation ?? null, pr: config.defaultPrImplementation ?? null };
    const projected = await listProjectedCapabilities(headerAuth.owner, headerAuth.repo, activeCapabilities);
    return NextResponse.json({ capabilities: projected, defaults }, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("[Capabilities] Error listing capabilities:", error);
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
      {
        capabilities: [],
        error: error?.message || "Failed to list capabilities",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  } finally {
    clearGitHubContext();
  }
}

const skillSchema = z.object({
  name: z.string().min(1).max(64),
  body: z.string().default(""),
});
const shellSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9._-]+\.sh$/, "must be a *.sh filename"),
  content: z.string().default(""),
});
const mcpServerSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "letters, digits, dash, underscore"),
  command: z.string().min(1, "command is required"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const createCapabilitySchema = z
  .object({
    slug: z.string().min(1).max(64).optional(),
    describe: z.string().default(""),
    instructions: z.string().min(1, "instructions are required").optional(),
    prompt: z.string().min(1).optional(),
    model: z.string().default("inherit"),
    permissionMode: z.enum(PERMISSION_MODES).default("acceptEdits"),
    tools: z.array(z.string()).default([]),
    skills: z.array(skillSchema).default([]),
    shellScripts: z.array(shellSchema).default([]),
    mcpServers: z.array(mcpServerSchema).default([]),
    landing: z.enum(["pr", "comment"]).default("pr"),
    profileJsonOverride: z.string().optional(),
    actorLogin: z.string().optional(),
  })
  .refine((input) => input.instructions || input.prompt, {
    message: "instructions are required",
    path: ["instructions"],
  });

/** Slugify the first plain words of the instructions into a valid slug. */
function slugifyInstructions(instructions: string): string {
  return instructions
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 5)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/**
 * Derive a valid, unused capability slug from the instructions. Appends a
 * numeric suffix when the base is taken. Returns null if nothing slug-able.
 */
async function deriveFreeSlug(instructions: string, owner: string, repo: string): Promise<string | null> {
  const base = slugifyInstructions(instructions);
  if (!base || !isValidSlug(base)) return null;
  if (!(await getProjectedCapability(owner, repo, base))) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`.slice(0, 64);
    if (!(await getProjectedCapability(owner, repo, candidate))) return candidate;
  }
  return null;
}

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
    const input = createCapabilitySchema.parse(await req.json());
    const instructions = input.instructions ?? input.prompt ?? "";

    // Slug is optional: when omitted, derive it from the instructions so a
    // caller can create a capability from instructions alone. A supplied slug
    // is still validated and must be free.
    let slug: string;
    if (input.slug) {
      if (!isValidSlug(input.slug)) {
        return NextResponse.json(
          {
            error: "invalid_slug",
            message:
              "Capability name must be lowercase letters, digits, dashes, or underscores.",
          },
          { status: 400 },
        );
      }
      if (await getProjectedCapability(headerAuth?.owner ?? "", headerAuth?.repo ?? "", input.slug)) {
        return NextResponse.json(
          {
            error: "slug_taken",
            message: `Capability "${input.slug}" already exists.`,
          },
          { status: 409 },
        );
      }
      slug = input.slug;
    } else {
      if (!headerAuth) return NextResponse.json({ error: "repository_context_required" }, { status: 400 });
      const derived = await deriveFreeSlug(instructions, headerAuth.owner, headerAuth.repo);
      if (!derived) {
        return NextResponse.json(
          {
            error: "invalid_slug",
            message:
              "Could not derive a name from the instructions — provide a slug or start the instructions with a few plain words.",
          },
          { status: 400 },
        );
      }
      slug = derived;
    }

    const actorResult = await verifyActorLogin(req, input.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;

    if (!headerAuth) return NextResponse.json({ error: "repository_context_required" }, { status: 400 });
    const capability = {
        slug,
        describe: input.describe,
        htmlUrl: "",
        updatedAt: new Date().toISOString(),
        source: "local" as const,
        agent: null,
        readOnly: false,
        landing: input.landing,
        prompt: instructions,
        model: input.model,
        permissionMode: input.permissionMode,
        tools: input.tools,
        skills: input.skills,
        shellScripts: input.shellScripts,
        mcpServers: input.mcpServers,
        profileJson: input.profileJsonOverride ?? "",
      };
    await saveProjectedCapability(headerAuth.owner, headerAuth.repo, capability);

    recordAudit(req, {
      action: "capability.create",
      resource: slug,
      detail: `created capability ${slug}`,
    });

    return NextResponse.json({ capability });
  } catch (error: any) {
    console.error("[Capabilities] Error creating capability:", error);
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
        message: error?.message ?? "Failed to create capability",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
