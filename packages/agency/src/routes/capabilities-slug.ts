/** Convex-owned simple Capability folder API. */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRequestAuth,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import { recordAudit } from "@kody-ade/base/activity/audit";
import {
  deleteCapabilityFile,
  isValidSlug,
  readResolvedCapabilityFile,
  writeCapabilityFolderFiles,
} from "@kody-ade/agency/capabilities";
import { clearGitHubContext, setGitHubContext } from "@kody-ade/agency/github";

const fileSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
});

const updateSchema = z.object({
  instructions: z.string().trim().min(1),
  skills: z.array(fileSchema).default([]),
  tools: z.array(fileSchema).default([]),
  actorLogin: z.string().optional(),
});

function requestContext(req: NextRequest) {
  const auth = getRequestAuth(req);
  if (!auth) return null;
  return { auth, tenantId: `${auth.owner}/${auth.repo}` };
}

function beginContext(context: NonNullable<ReturnType<typeof requestContext>>) {
  const { auth } = context;
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
}

function capabilityFiles(input: z.infer<typeof updateSchema>) {
  const files: Record<string, string> = {
    "instructions.md": `${input.instructions.trim()}\n`,
  };
  for (const skill of input.skills) {
    files[`skills/${skill.path}`] = skill.content;
  }
  for (const tool of input.tools) {
    files[`tools/${tool.path}`] = tool.content;
  }
  return files;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authError = await requireKodyAuth(req);
  if (authError instanceof NextResponse) return authError;
  const context = requestContext(req);
  if (!context) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  beginContext(context);
  try {
    const capability = await readResolvedCapabilityFile(slug);
    return capability
      ? NextResponse.json({ capability })
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
  const context = requestContext(req);
  if (!context) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  beginContext(context);
  try {
    const input = updateSchema.parse(await req.json());
    const actorResult = await verifyActorLogin(req, input.actorLogin);
    if (actorResult instanceof NextResponse) return actorResult;
    if (!(await readResolvedCapabilityFile(slug))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await writeCapabilityFolderFiles({
      slug,
      files: capabilityFiles(input),
      isUpdate: true,
    });
    const capability = await readResolvedCapabilityFile(slug);
    recordAudit(req, {
      action: "capability.update",
      resource: slug,
      detail: `edited capability ${slug}`,
    });
    return NextResponse.json({ capability });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "validation_error", details: error.issues },
        { status: 400 },
      );
    }
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
  const context = requestContext(req);
  if (!context) {
    return NextResponse.json(
      { error: "repository_context_required" },
      { status: 400 },
    );
  }
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  beginContext(context);
  try {
    const actorResult = await verifyActorLogin(
      req,
      new URL(req.url).searchParams.get("actorLogin") ?? undefined,
    );
    if (actorResult instanceof NextResponse) return actorResult;
    if (!(await readResolvedCapabilityFile(slug))) {
      return NextResponse.json({ success: true, alreadyMissing: true });
    }
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
