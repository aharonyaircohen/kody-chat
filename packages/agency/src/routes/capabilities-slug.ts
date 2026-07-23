/** Convex-owned capability detail API. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireKodyAuth,
  verifyActorLogin,
  getRequestAuth,
} from "@kody-ade/base/auth";
import {
  companyStoreAssetPath,
  readCompanyStoreText,
} from "@kody-ade/base/company-store/assets";
import { getEngineConfig } from "@kody-ade/base/engine/config";
import { recordAudit } from "@kody-ade/base/activity/audit";
import type { ImplementationDefinition } from "@kody-ade/agency-domain";
import {
  deleteCapabilityFile,
  isValidSlug,
  PERMISSION_MODES,
  readResolvedCapabilityFile,
  writeCapabilityFile,
} from "@kody-ade/agency/capabilities";
import {
  clearGitHubContext,
  getOctokit,
  setGitHubContext,
} from "@kody-ade/agency/github";
import { listStoredAgencyDefinitions } from "../backend/agency-model-store";
import { resolveCapabilityImplementations } from "../implementation-resolution";

const skillSchema = z.object({
  name: z.string().min(1).max(64),
  body: z.string().default(""),
});
const shellSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9._-]+\.sh$/),
  content: z.string().default(""),
});
const mcpServerSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const updateSchema = z.object({
  describe: z.string().optional(),
  instructions: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  model: z.string().optional(),
  permissionMode: z.enum(PERMISSION_MODES).optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(skillSchema).optional(),
  shellScripts: z.array(shellSchema).optional(),
  mcpServers: z.array(mcpServerSchema).optional(),
  landing: z.enum(["pr", "comment"]).optional(),
  profileJsonOverride: z.string().optional(),
  actorLogin: z.string().optional(),
});

function context(req: NextRequest): string | null {
  const auth = getRequestAuth(req);
  return auth ? `${auth.owner}/${auth.repo}` : null;
}

async function getCapability(
  _tenantId: string,
  slug: string,
): Promise<any | null> {
  return readResolvedCapabilityFile(slug);
}

function parseRuntime(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function implementationPresentation(
  owner: string,
  repo: string,
  capabilityId: string,
) {
  const definitions = await listStoredAgencyDefinitions(owner, repo);
  const octokit = getOctokit();
  const { config } = await getEngineConfig(octokit, owner, repo);
  const repositoryBinding =
    config.execution?.capabilityBindings?.[capabilityId];
  const resolution = resolveCapabilityImplementations(
    definitions,
    capabilityId,
    repositoryBinding,
  );
  const candidates = await Promise.all(
    resolution.candidates.map(async (record) => {
      const definition = record.data as unknown as ImplementationDefinition;
      let runtime: Record<string, unknown> | null = null;
      let promptTemplate: string | null = null;
      try {
        const root = await companyStoreAssetPath(
          octokit,
          "implementations",
          definition.id,
        );
        const [runtimeRaw, promptRaw] = await Promise.all([
          readCompanyStoreText(octokit, `${root}/runtime.json`),
          definition.type === "agent"
            ? readCompanyStoreText(octokit, `${root}/prompt.md`)
            : Promise.resolve(null),
        ]);
        runtime = parseRuntime(runtimeRaw);
        promptTemplate = promptRaw?.trim() || null;
      } catch {
        // The immutable Definition remains useful even if its runtime package
        // is temporarily unavailable.
      }
      return {
        id: definition.id,
        type: definition.type,
        compatibleCapabilityRevision: definition.compatibleCapabilityRevision,
        ...(definition.type === "agent"
          ? { agentId: definition.agentRef.id }
          : {}),
        runtime,
        promptTemplate,
      };
    }),
  );
  return {
    status: resolution.status,
    capabilityRevision: resolution.capabilityRevision,
    ...(resolution.selected ? { selectedId: resolution.selected.data.id } : {}),
    ...(repositoryBinding ? { repositoryBinding } : {}),
    candidates,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const tenantId = context(req);
  if (!tenantId)
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  const { slug } = await params;
  if (!isValidSlug(slug))
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  const auth = getRequestAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const capability = await getCapability(tenantId, slug);
    const implementationResolution = capability
      ? await implementationPresentation(auth.owner, auth.repo, slug)
      : null;
    return capability
      ? NextResponse.json({
          capability: { ...capability, implementationResolution },
        })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "fetch_failed",
        message:
          error instanceof Error ? error.message : "Failed to fetch capability",
      },
      { status: 503 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const tenantId = auth ? `${auth.owner}/${auth.repo}` : null;
  if (!auth || !tenantId)
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  const { slug } = await params;
  if (!isValidSlug(slug))
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const input = updateSchema.parse(await req.json());
    const actorResult = await verifyActorLogin(req, input.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;
    const existing = await getCapability(tenantId, slug);
    if (!existing)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const capability = {
      ...existing,
      ...input,
      prompt: input.instructions ?? input.prompt ?? existing.prompt,
      updatedAt: new Date().toISOString(),
      source: "local",
      readOnly: false,
    };
    await writeCapabilityFile({
      fields: {
        slug,
        describe: capability.describe ?? "",
        prompt: capability.prompt ?? "",
        model: capability.model ?? "inherit",
        permissionMode: capability.permissionMode ?? "acceptEdits",
        tools: capability.tools ?? [],
        skills: (capability.skills ?? []).map(
          (skill: { name: string }) => skill.name,
        ),
        shellScripts: (capability.shellScripts ?? []).map(
          (script: { name: string }) => script.name,
        ),
        mcpServers: capability.mcpServers ?? [],
        landing: capability.landing ?? "pr",
      },
      skills: capability.skills ?? [],
      shellScripts: capability.shellScripts ?? [],
      ...(capability.profileJsonOverride
        ? { profileJsonOverride: capability.profileJsonOverride }
        : {}),
      isUpdate: true,
    });
    recordAudit(req, {
      action: "capability.update",
      resource: slug,
      detail: `edited capability ${slug}`,
    });
    return NextResponse.json({ capability });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "validation_error", details: error.issues },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error: "update_failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to update capability",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const auth = getRequestAuth(req);
  const tenantId = auth ? `${auth.owner}/${auth.repo}` : null;
  if (!auth || !tenantId)
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  const { slug } = await params;
  if (!isValidSlug(slug))
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  try {
    const actorResult = await verifyActorLogin(
      req,
      new URL(req.url).searchParams.get("actorLogin") ?? undefined,
    );
    if (actorResult instanceof NextResponse) return actorResult;
    const existing = await getCapability(tenantId, slug);
    if (!existing)
      return NextResponse.json({ success: true, alreadyMissing: true });
    await deleteCapabilityFile(slug);
    recordAudit(req, {
      action: "capability.delete",
      resource: slug,
      detail: `deleted capability ${slug}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "delete_failed",
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete capability",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
