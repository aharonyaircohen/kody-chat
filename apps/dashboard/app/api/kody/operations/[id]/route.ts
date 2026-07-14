/** @fileType api-endpoint @domain agency-operations @pattern operation-detail-api */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isOperationId,
  operationActivationIssues,
  operationOwnershipIssues,
  operationPath,
  parseOperation,
  OPERATION_STATUSES,
} from "@kody-ade/agency/operations";
import {
  getRequestAuth,
  getUserOctokit,
  requireKodyAuth,
  verifyActorLogin,
} from "@kody-ade/base/auth";
import {
  clearGitHubContext,
  setGitHubContext,
} from "@dashboard/lib/github-client";
import {
  deleteOperationFile,
  listOperationFiles,
  loadOperationCatalog,
  readOperationFile,
  writeOperationFile,
} from "@dashboard/lib/operation-files";

const idList = z.array(z.string().trim().min(1).max(64));
const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  responsibility: z.string().trim().min(1).max(4000).optional(),
  doesNotOwn: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(30)
    .optional(),
  intentIds: idList.min(1).optional(),
  goals: idList.optional(),
  loops: idList.optional(),
  status: z.enum(OPERATION_STATUSES).optional(),
  actorLogin: z.string().trim().optional(),
});

function mapError(error: any, fallback: string) {
  if (error?.status === 401)
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  if (error?.status === 403 || error?.message?.includes("rate limit")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return NextResponse.json(
    { error: fallback, message: error?.message ?? fallback },
    { status: 500 },
  );
}

async function context(req: NextRequest) {
  const authResult = await requireKodyAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = getRequestAuth(req);
  if (!auth)
    return NextResponse.json({ error: "no_repo_context" }, { status: 400 });
  setGitHubContext(
    auth.owner,
    auth.repo,
    auth.token,
    auth.storeRepoUrl,
    auth.storeRef,
  );
  const octokit = await getUserOctokit(req);
  if (!octokit)
    return NextResponse.json({ error: "no_user_token" }, { status: 401 });
  return { auth, octokit };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isOperationId(id))
    return NextResponse.json(
      { error: "invalid_operation_id" },
      { status: 400 },
    );
  try {
    const ctx = await context(req);
    if (ctx instanceof NextResponse) return ctx;
    const record = await readOperationFile(
      ctx.octokit,
      ctx.auth.owner,
      ctx.auth.repo,
      id,
    );
    if (!record)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const [catalog, records] = await Promise.all([
      loadOperationCatalog(ctx.octokit, ctx.auth.owner, ctx.auth.repo),
      listOperationFiles(ctx.octokit, ctx.auth.owner, ctx.auth.repo),
    ]);
    return NextResponse.json({
      operation: {
        id,
        path: record.path,
        operation: record.operation,
        activationIssues: [
          ...operationActivationIssues(record.operation, catalog),
          ...operationOwnershipIssues(
            record.operation,
            records.map((item) => item.operation),
          ),
        ],
      },
      catalog,
    });
  } catch (error) {
    return mapError(error, "failed_to_read_operation");
  } finally {
    clearGitHubContext();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isOperationId(id))
    return NextResponse.json(
      { error: "invalid_operation_id" },
      { status: 400 },
    );
  try {
    const ctx = await context(req);
    if (ctx instanceof NextResponse) return ctx;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 },
      );
    const actor = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actor instanceof NextResponse) return actor;
    const current = await readOperationFile(
      ctx.octokit,
      ctx.auth.owner,
      ctx.auth.repo,
      id,
    );
    if (!current)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (current.operation.status === "retired") {
      return NextResponse.json({ error: "operation_retired" }, { status: 409 });
    }
    const { actorLogin: _actorLogin, ...patch } = parsed.data;
    const operation = parseOperation(operationPath(id), {
      ...current.operation,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    const [catalog, records] = await Promise.all([
      loadOperationCatalog(ctx.octokit, ctx.auth.owner, ctx.auth.repo),
      listOperationFiles(ctx.octokit, ctx.auth.owner, ctx.auth.repo),
    ]);
    const issues = [
      ...operationActivationIssues(operation, catalog),
      ...operationOwnershipIssues(
        operation,
        records.map((item) => item.operation),
      ),
    ];
    if (operation.status === "active" && issues.length > 0) {
      return NextResponse.json(
        { error: "operation_not_ready", issues },
        { status: 409 },
      );
    }
    await writeOperationFile({
      octokit: ctx.octokit,
      owner: ctx.auth.owner,
      repo: ctx.auth.repo,
      operation,
      sha: current.sha,
      message: `chore(operations): update ${id}`,
    });
    return NextResponse.json({
      operation: {
        id,
        path: current.path,
        operation,
        activationIssues: issues,
      },
    });
  } catch (error) {
    return mapError(error, "failed_to_update_operation");
  } finally {
    clearGitHubContext();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isOperationId(id))
    return NextResponse.json(
      { error: "invalid_operation_id" },
      { status: 400 },
    );
  try {
    const ctx = await context(req);
    if (ctx instanceof NextResponse) return ctx;
    const actor = await verifyActorLogin(
      req,
      req.nextUrl.searchParams.get("actorLogin") ?? undefined,
    );
    if (actor instanceof NextResponse) return actor;
    const current = await readOperationFile(
      ctx.octokit,
      ctx.auth.owner,
      ctx.auth.repo,
      id,
    );
    if (!current)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (current.operation.status === "active") {
      return NextResponse.json(
        {
          error: "operation_active",
          message: "Pause or retire the Operation before deleting it.",
        },
        { status: 409 },
      );
    }
    await deleteOperationFile({
      octokit: ctx.octokit,
      owner: ctx.auth.owner,
      repo: ctx.auth.repo,
      id,
      sha: current.sha,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return mapError(error, "failed_to_delete_operation");
  } finally {
    clearGitHubContext();
  }
}
