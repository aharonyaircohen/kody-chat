/**
 * @fileType api-endpoint
 * @domain agency-operations
 * @pattern operations-api
 * @ai-summary Lists and creates Operation contracts in the state repo.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildOperation,
  operationActivationIssues,
  operationOwnershipIssues,
  slugifyOperationId,
  type Operation,
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
  listOperationFiles,
  loadOperationCatalog,
  readOperationFile,
  writeOperationFile,
  type StoredOperationRecord,
} from "@dashboard/lib/operation-files";

const idListSchema = z.array(z.string().trim().min(1).max(64)).default([]);
const createSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(160),
  responsibility: z.string().trim().min(1).max(4000),
  doesNotOwn: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  intentIds: idListSchema.pipe(z.array(z.string()).min(1)),
  goals: idListSchema,
  loops: idListSchema,
  actorLogin: z.string().trim().optional(),
});

function publicRecord(
  record: StoredOperationRecord,
  catalog: Awaited<ReturnType<typeof loadOperationCatalog>>,
  operations: readonly Operation[],
) {
  return {
    id: record.id,
    path: record.path,
    operation: record.operation,
    activationIssues: [
      ...operationActivationIssues(record.operation, catalog),
      ...operationOwnershipIssues(record.operation, operations),
    ],
  };
}

function mapError(error: any, fallback: string) {
  if (error?.status === 401) {
    return NextResponse.json(
      { error: "github_token_expired" },
      { status: 401 },
    );
  }
  if (error?.status === 403 || error?.message?.includes("rate limit")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  return NextResponse.json(
    { error: fallback, message: error?.message ?? fallback },
    { status: 500 },
  );
}

export async function GET(req: NextRequest) {
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
  try {
    const octokit = await getUserOctokit(req);
    if (!octokit)
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });
    const [records, catalog] = await Promise.all([
      listOperationFiles(octokit, auth.owner, auth.repo),
      loadOperationCatalog(octokit, auth.owner, auth.repo),
    ]);
    return NextResponse.json(
      {
        operations: records.map((record) =>
          publicRecord(
            record,
            catalog,
            records.map((item) => item.operation),
          ),
        ),
        catalog,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mapError(error, "failed_to_list_operations");
  } finally {
    clearGitHubContext();
  }
}

export async function POST(req: NextRequest) {
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
  try {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_body", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const actor = await verifyActorLogin(req, parsed.data.actorLogin);
    if (actor instanceof NextResponse) return actor;
    const octokit = await getUserOctokit(req);
    if (!octokit)
      return NextResponse.json({ error: "no_user_token" }, { status: 401 });

    const id = parsed.data.id?.trim() || slugifyOperationId(parsed.data.name);
    const operation = buildOperation({
      id,
      name: parsed.data.name,
      responsibility: parsed.data.responsibility,
      doesNotOwn: parsed.data.doesNotOwn,
      intentIds: parsed.data.intentIds,
      goals: parsed.data.goals,
      loops: parsed.data.loops,
    });
    if (await readOperationFile(octokit, auth.owner, auth.repo, operation.id)) {
      return NextResponse.json(
        {
          error: "operation_exists",
          message: `Operation "${operation.id}" already exists.`,
        },
        { status: 409 },
      );
    }
    const [catalog, records] = await Promise.all([
      loadOperationCatalog(octokit, auth.owner, auth.repo),
      listOperationFiles(octokit, auth.owner, auth.repo),
    ]);
    const allIssues = [
      ...operationActivationIssues(operation, catalog),
      ...operationOwnershipIssues(
        operation,
        records.map((record) => record.operation),
      ),
    ];
    const missingIntents = allIssues.filter((issue) =>
      issue.startsWith("Missing Intent"),
    );
    if (missingIntents.length > 0) {
      return NextResponse.json(
        { error: "operation_missing_intent", issues: missingIntents },
        { status: 409 },
      );
    }
    await writeOperationFile({
      octokit,
      owner: auth.owner,
      repo: auth.repo,
      operation,
      message: `chore(operations): create ${operation.id}`,
    });
    return NextResponse.json(
      {
        operation: publicRecord(
          {
            id: operation.id,
            path: `operations/${operation.id}/operation.json`,
            sha: "",
            operation,
          },
          catalog,
          [...records.map((record) => record.operation), operation],
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return mapError(error, "failed_to_create_operation");
  } finally {
    clearGitHubContext();
  }
}
