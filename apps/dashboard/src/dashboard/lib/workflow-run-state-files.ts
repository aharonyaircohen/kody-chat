import type { Octokit } from "@octokit/rest";
import { listStateDirectory, readStateText } from "@kody-ade/base/state-repo";
import {
  normalizeWorkflowRunState,
  type WorkflowRunStateRecord,
} from "./workflow-run-state";

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

function workflowRunPath(workflowId: string, runId: string): string {
  if (!SAFE_ID.test(workflowId) || !SAFE_ID.test(runId)) {
    throw new Error("Invalid workflow or run id");
  }
  return `workflows/${workflowId}/runs/${runId}.json`;
}

export async function readWorkflowRunStateFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  workflowId: string,
  runId: string,
): Promise<WorkflowRunStateRecord | null> {
  const file = await readStateText(
    octokit,
    owner,
    repo,
    workflowRunPath(workflowId, runId),
    { headers: { "If-None-Match": "" } },
  );
  if (!file) return null;
  try {
    const state = normalizeWorkflowRunState(JSON.parse(file.content));
    return state ? { workflowId, runId, state } : null;
  } catch {
    return null;
  }
}

export async function readLatestWorkflowRunStateFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  workflowId: string,
): Promise<WorkflowRunStateRecord | null> {
  let entries;
  try {
    ({ entries } = await listStateDirectory(
      octokit,
      owner,
      repo,
      `workflows/${workflowId}/runs`,
      { headers: { "If-None-Match": "" } },
    ));
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
  const runId = entries
    .filter(
      (entry) =>
        entry.type === "file" && /^run-[a-z0-9]+\.json$/.test(entry.name),
    )
    .map((entry) => entry.name.slice(0, -5))
    .sort()
    .at(-1);
  return runId
    ? readWorkflowRunStateFile(octokit, owner, repo, workflowId, runId)
    : null;
}
