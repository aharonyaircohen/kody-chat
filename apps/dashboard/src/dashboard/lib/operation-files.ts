/**
 * @fileType utility
 * @domain agency-operations
 * @pattern operation-files
 * @ai-summary Reads and writes Operation contracts in the Convex backend
 *   (repoDocs, kind `operation:<id>`, doc = the Operation JSON). Follows the
 *   context-docs approach: one repoDocs kind per operation, listed via
 *   repoDocs.listByPrefix. Exported signatures are unchanged from the
 *   state-repo era; octokit params are unused and `sha` is always "".
 */

import type { Octokit } from "@octokit/rest";

import {
  isOperationId,
  operationPath,
  parseOperation,
  type Operation,
  type OperationCatalog,
} from "@kody-ade/agency/operations";
import { logger } from "@kody-ade/base/logger";
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "./backend/convex-backend";
import { listCompanyIntentRecords } from "./company-intents-store";
import { listManagedGoalFiles } from "./managed-goals-files";
import { managedGoalModel } from "./managed-goals";

const OPERATION_KIND_PREFIX = "operation:";

export interface StoredOperationRecord {
  id: string;
  path: string;
  sha: string;
  operation: Operation;
}

interface OperationDocRecord {
  kind: string;
  doc: unknown;
}

function operationKind(id: string): string {
  return `${OPERATION_KIND_PREFIX}${id}`;
}

function recordFromDoc(record: OperationDocRecord): StoredOperationRecord | null {
  const id = record.kind.slice(OPERATION_KIND_PREFIX.length);
  if (!isOperationId(id)) return null;
  const path = operationPath(id);
  try {
    return { id, path, sha: "", operation: parseOperation(path, record.doc) };
  } catch (error) {
    logger.warn(
      { error, operationId: id },
      "operations: skipped malformed Operation",
    );
    return null;
  }
}

export async function readOperationFile(
  _octokit: Octokit,
  owner: string,
  repo: string,
  id: string,
): Promise<StoredOperationRecord | null> {
  if (!isOperationId(id)) return null;
  const record = (await getConvexClient().query(backendApi.repoDocs.get, {
    tenantId: tenantIdFor(owner, repo),
    kind: operationKind(id),
  })) as OperationDocRecord | null;
  if (!record) return null;
  return recordFromDoc(record);
}

export async function listOperationFiles(
  _octokit: Octokit,
  owner: string,
  repo: string,
): Promise<StoredOperationRecord[]> {
  const records = (await getConvexClient().query(
    backendApi.repoDocs.listByPrefix,
    {
      tenantId: tenantIdFor(owner, repo),
      prefix: OPERATION_KIND_PREFIX,
    },
  )) as OperationDocRecord[];
  return records
    .map(recordFromDoc)
    .filter((record): record is StoredOperationRecord => record !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function writeOperationFile({
  owner,
  repo,
  operation,
}: {
  octokit?: Octokit;
  owner: string;
  repo: string;
  operation: Operation;
  sha?: string;
  message?: string;
}): Promise<void> {
  await getConvexClient().mutation(backendApi.repoDocs.save, {
    tenantId: tenantIdFor(owner, repo),
    kind: operationKind(operation.id),
    doc: operation,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteOperationFile({
  owner,
  repo,
  id,
}: {
  octokit?: Octokit;
  owner: string;
  repo: string;
  id: string;
  sha?: string;
}): Promise<void> {
  await getConvexClient().mutation(backendApi.repoDocs.remove, {
    tenantId: tenantIdFor(owner, repo),
    kind: operationKind(id),
  });
}

export async function loadOperationCatalog(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<OperationCatalog> {
  const intentRecords = await listCompanyIntentRecords(owner, repo);
  const intents = intentRecords
    .filter(
      (record) =>
        record.intent.status === "active" && isOperationId(record.id),
    )
    .map((record) => record.id);

  const goals: string[] = [];
  const loops: string[] = [];
  for (const record of await listManagedGoalFiles(octokit, owner, repo)) {
    if (managedGoalModel(record) === "agentLoop") loops.push(record.id);
    else goals.push(record.id);
  }

  return {
    intents: intents.sort(),
    goals: goals.sort(),
    loops: loops.sort(),
  };
}
