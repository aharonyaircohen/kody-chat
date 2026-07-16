/**
 * @fileType utility
 * @domain kody
 * @pattern workflow-run-state-files
 * @ai-summary Read workflow run state from the Convex backend
 *   (workflowRuns.{get,list}, tenant-scoped by owner/repo).
 */
import {
  backendApi,
  getConvexClient,
  tenantIdFor,
} from "./backend/convex-backend";
import {
  normalizeWorkflowRunState,
  type WorkflowRunState,
  type WorkflowRunStateRecord,
} from "./workflow-run-state";

const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

function assertIds(workflowId: string, runId?: string): void {
  if (
    !SAFE_ID.test(workflowId) ||
    (runId !== undefined && !SAFE_ID.test(runId))
  ) {
    throw new Error("Invalid workflow or run id");
  }
}

interface WorkflowRunDoc {
  runId: string;
  state: unknown;
  runner?: { kind: "pool" | "fly"; machineId: string };
}

export async function readWorkflowRunStateFile(
  owner: string,
  repo: string,
  workflowId: string,
  runId: string,
): Promise<WorkflowRunStateRecord | null> {
  assertIds(workflowId, runId);
  const doc = (await getConvexClient().query(backendApi.workflowRuns.get, {
    tenantId: tenantIdFor(owner, repo),
    workflowId,
    runId,
  })) as WorkflowRunDoc | null;
  if (!doc) return null;
  const state = normalizeWorkflowRunState(doc.state);
  return state
    ? { workflowId, runId, state, ...(doc.runner ? { runner: doc.runner } : {}) }
    : null;
}

export async function readLatestWorkflowRunStateFile(
  owner: string,
  repo: string,
  workflowId: string,
): Promise<WorkflowRunStateRecord | null> {
  assertIds(workflowId);
  const docs = (await getConvexClient().query(backendApi.workflowRuns.list, {
    tenantId: tenantIdFor(owner, repo),
    workflowId,
  })) as WorkflowRunDoc[];
  const latest = docs
    .filter((doc) => /^run-[a-z0-9]+$/.test(doc.runId))
    .map((doc) => doc.runId)
    .sort()
    .at(-1);
  if (!latest) return null;
  const doc = docs.find((d) => d.runId === latest);
  const state = doc ? normalizeWorkflowRunState(doc.state) : null;
  return state
    ? { workflowId, runId: latest, state, ...(doc?.runner ? { runner: doc.runner } : {}) }
    : null;
}

export async function recordWorkflowRunRunner(
  owner: string,
  repo: string,
  workflowId: string,
  runId: string,
  runner: { kind: "pool" | "fly"; machineId: string },
): Promise<void> {
  assertIds(workflowId, runId);
  const existing = await getConvexClient().query(backendApi.workflowRuns.get, {
    tenantId: tenantIdFor(owner, repo), workflowId, runId,
  }) as WorkflowRunDoc | null;
  const fallback: WorkflowRunState = { status: "running", completedStepIds: [], transitionCounts: {}, facts: {}, evidence: {}, artifacts: [] };
  await getConvexClient().mutation(backendApi.workflowRuns.save, {
    tenantId: tenantIdFor(owner, repo), workflowId, runId,
    state: normalizeWorkflowRunState(existing?.state) ?? fallback,
    runner,
    updatedAt: new Date().toISOString(),
  });
}
