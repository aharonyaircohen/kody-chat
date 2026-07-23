import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRepoWriteAccess } from "@kody-ade/base/auth";
import { listStoredAgencyDefinitions } from "@kody-ade/agency/backend/agency-model-store";
import { buildKodyWorkflowDispatchInputs } from "@dashboard/lib/kody-workflow-dispatch";

const loopIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,127}$/);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await verifyRepoWriteAccess(req);
  if (access instanceof NextResponse) return access;

  const parsedId = loopIdSchema.safeParse((await params).id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "invalid_loop_id" }, { status: 400 });
  }

  const definitions = await listStoredAgencyDefinitions(
    access.auth.owner,
    access.auth.repo,
  );
  const loopExists = definitions.some(
    (definition) =>
      definition.kind === "loop" && definition.data.id === parsedId.data,
  );
  if (!loopExists) {
    return NextResponse.json({ error: "loop_not_found" }, { status: 404 });
  }

  try {
    const repo = await access.octokit.rest.repos.get({
      owner: access.auth.owner,
      repo: access.auth.repo,
    });
    const ref = repo.data.default_branch || "main";
    const inputs = await buildKodyWorkflowDispatchInputs(access.octokit, {
      owner: access.auth.owner,
      repo: access.auth.repo,
      ref,
      action: "dispatch-due-loops",
      message: parsedId.data,
      storeRepoUrl: access.auth.storeRepoUrl,
      storeRef: access.auth.storeRef,
    });
    await access.octokit.rest.actions.createWorkflowDispatch({
      owner: access.auth.owner,
      repo: access.auth.repo,
      workflow_id: "kody.yml",
      ref,
      inputs,
    });
    return NextResponse.json(
      { ok: true, loopId: parsedId.data },
      { status: 202 },
    );
  } catch {
    return NextResponse.json({ error: "loop_dispatch_failed" }, { status: 500 });
  }
}
