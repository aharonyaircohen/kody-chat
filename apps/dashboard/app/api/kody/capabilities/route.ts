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
  listCapabilityFiles,
  readCapabilityFile,
  writeCapabilityFolderFiles,
} from "@kody-ade/agency/capabilities";
import { createCapabilityDefinition } from "@kody-ade/agency-domain";
import {
  setGitHubContext,
  clearGitHubContext,
} from "@dashboard/lib/github-client";
import { isValidSlug } from "@dashboard/lib/capabilities";
import { getProjectedEngineConfig } from "@dashboard/lib/backend/repo-projection";
import { recordAudit } from "@dashboard/lib/activity/audit";

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
    let defaults = { issue: null as string | null, pr: null as string | null };
    if (!headerAuth)
      return NextResponse.json(
        { error: "repository_context_required" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    const { config } = await getProjectedEngineConfig(
      {} as never,
      headerAuth.owner,
      headerAuth.repo,
    );
    defaults = {
      issue: config.defaultImplementation ?? null,
      pr: config.defaultPrImplementation ?? null,
    };
    const projected = await listCapabilityFiles();
    return NextResponse.json(
      { capabilities: projected, defaults },
      { headers: NO_STORE_HEADERS },
    );
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

const jsonObjectSchema = z.record(z.string(), z.unknown());
const createCapabilitySchema = z.object({
  slug: z.string().min(1).max(64),
  action: z.string().min(1),
  purpose: z.string().min(1),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema,
  effects: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  success: z.string().min(1),
  failure: z.string().min(1),
  documentation: z.string().default(""),
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
    const input = createCapabilitySchema.parse(await req.json());
    const slug = input.slug;
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: "invalid_slug", message: "Use lowercase letters, numbers, and dashes." },
        { status: 400 },
      );
    }
    if (await readCapabilityFile(slug)) {
      return NextResponse.json(
        { error: "slug_taken", message: `Capability "${slug}" already exists.` },
        { status: 409 },
      );
    }

    const actorResult = await verifyActorLogin(req, input.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;

    if (!headerAuth)
      return NextResponse.json(
        { error: "repository_context_required" },
        { status: 400 },
      );
    const definition = createCapabilityDefinition({
      id: slug,
      action: input.action,
      purpose: input.purpose,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
      effects: input.effects,
      permissions: input.permissions,
      success: input.success,
      failure: input.failure,
    });
    await writeCapabilityFolderFiles({
      slug,
      files: {
        "definition.json": `${JSON.stringify(definition, null, 2)}\n`,
        "capability.md": input.documentation.trim()
          ? `${input.documentation.trim()}\n`
          : "",
      },
    });
    const capability = await readCapabilityFile(slug);
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
