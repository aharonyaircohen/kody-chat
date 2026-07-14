/**
 * @fileType utility
 * @domain agency-operations
 * @pattern operation-files
 * @ai-summary Reads and writes Operation contracts in the configured state repo.
 */

import type { Octokit } from "@octokit/rest";

import {
  isOperationId,
  operationPath,
  parseOperation,
  type Operation,
  type OperationCatalog,
} from "@kody-ade/agency/operations";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "@kody-ade/base/state-repo";
import { logger } from "@kody-ade/base/logger";
import { normalizeCompanyIntent } from "./company-intents";
import { listManagedGoalFiles } from "./managed-goals-files";
import { managedGoalModel } from "./managed-goals";

export interface StoredOperationRecord {
  id: string;
  path: string;
  sha: string;
  operation: Operation;
}

async function listDirectorySafe(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
) {
  try {
    return (await listStateDirectory(octokit, owner, repo, path)).entries;
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) return [];
    throw error;
  }
}

export async function readOperationFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  id: string,
): Promise<StoredOperationRecord | null> {
  if (!isOperationId(id)) return null;
  const file = await readStateText(octokit, owner, repo, operationPath(id));
  if (!file) return null;
  return {
    id,
    path: file.path,
    sha: file.sha,
    operation: parseOperation(file.path, JSON.parse(file.content)),
  };
}

export async function listOperationFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<StoredOperationRecord[]> {
  const entries = await listDirectorySafe(octokit, owner, repo, "operations");
  const records = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.type === "dir" &&
          typeof entry.name === "string" &&
          isOperationId(entry.name),
      )
      .map(async (entry) => {
        try {
          return await readOperationFile(octokit, owner, repo, entry.name);
        } catch (error) {
          logger.warn(
            { error, operationId: entry.name },
            "operations: skipped malformed Operation",
          );
          return null;
        }
      }),
  );
  return records
    .filter((record): record is StoredOperationRecord => record !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function writeOperationFile({
  octokit,
  owner,
  repo,
  operation,
  sha,
  message = `chore(operations): save ${operation.id}`,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  operation: Operation;
  sha?: string;
  message?: string;
}): Promise<void> {
  await writeStateText({
    octokit,
    owner,
    repo,
    path: operationPath(operation.id),
    content: `${JSON.stringify(operation, null, 2)}\n`,
    message,
    ...(sha ? { sha } : {}),
  });
}

export async function deleteOperationFile({
  octokit,
  owner,
  repo,
  id,
  sha,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  id: string;
  sha: string;
}): Promise<void> {
  await deleteStateFile({
    octokit,
    owner,
    repo,
    path: operationPath(id),
    sha,
    message: `chore(operations): delete ${id}`,
  });
}

export async function loadOperationCatalog(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<OperationCatalog> {
  const intentEntries = await listDirectorySafe(
    octokit,
    owner,
    repo,
    "intents",
  );
  const intents = (
    await Promise.all(
      intentEntries
        .filter(
          (entry) =>
            entry.type === "dir" &&
            typeof entry.name === "string" &&
            isOperationId(entry.name),
        )
        .map(async (entry) => {
          try {
            const file = await readStateText(
              octokit,
              owner,
              repo,
              `intents/${entry.name}/intent.json`,
            );
            if (!file) return null;
            const intent = normalizeCompanyIntent(
              file.path,
              JSON.parse(file.content),
            );
            return intent.status === "active" ? intent.id : null;
          } catch {
            return null;
          }
        }),
    )
  ).filter((id): id is string => id !== null);

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
