import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordAudit } from "@kody-ade/base/activity/audit";
import {
  getEngineConfig,
  writeConfigPatch,
} from "@kody-ade/base/engine/config";
import { isValidSlug } from "../capabilities";
import { listStoredAgencyDefinitions } from "../backend/agency-model-store";
import { resolveCapabilityImplementations } from "../implementation-resolution";
import {
  clearGitHubContext,
  getOctokit,
  setGitHubContext,
} from "../github";
import { verifyRepoWriteAccess } from "./repo-write-access";

const inputSchema = z.object({
  implementationId: z.string().regex(/^[a-z][a-z0-9-]{0,127}$/),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;
  const { slug } = await params;
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }
  setGitHubContext(
    access.auth.owner,
    access.auth.repo,
    access.auth.token,
    access.auth.storeRepoUrl,
    access.auth.storeRef,
  );
  try {
    const octokit = getOctokit();
    const definitions = await listStoredAgencyDefinitions(
      access.auth.owner,
      access.auth.repo,
    );
    const resolution = resolveCapabilityImplementations(definitions, slug);
    if (
      !resolution.candidates.some(
        (candidate) => candidate.data.id === parsed.data.implementationId,
      )
    ) {
      return NextResponse.json(
        { error: "implementation_not_compatible" },
        { status: 409 },
      );
    }
    const { config } = await getEngineConfig(
      octokit,
      access.auth.owner,
      access.auth.repo,
      { force: true },
    );
    const capabilityBindings = {
      ...(config.execution?.capabilityBindings ?? {}),
      [slug]: parsed.data.implementationId,
    };
    await writeConfigPatch(
      octokit,
      access.auth.owner,
      access.auth.repo,
      { capabilityBindings },
      `Configure ${slug} implementation`,
    );
    recordAudit(req, {
      action: "capability.implementation.bind",
      resource: slug,
      detail: `bound ${slug} to ${parsed.data.implementationId}`,
    });
    return NextResponse.json({
      capabilityId: slug,
      implementationId: parsed.data.implementationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "implementation_binding_failed",
        message:
          error instanceof Error ? error.message : "Failed to save binding",
      },
      { status: 500 },
    );
  } finally {
    clearGitHubContext();
  }
}
