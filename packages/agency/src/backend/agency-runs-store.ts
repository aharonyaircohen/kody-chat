import { api as backendApi } from "@kody-ade/backend/api"
import { createBackendClient } from "@kody-ade/backend/client"

function tenantIdFor(owner: string, repo: string): string {
  const tenantId = `${owner.trim()}/${repo.trim()}`
  if (!/^[^/\s]+\/[^/\s]+$/.test(tenantId)) throw new Error("Invalid tenant repository")
  return tenantId
}

export type StoredAgencyRun = {
  runId: string
  subjectType: "goal" | "loop" | "workflow" | "capability" | "implementation"
  subjectId: string
  run: unknown
  updatedAt: string
}

export type StoredRunEvent = {
  runId: string
  goalId?: string
  seq: number
  event: unknown
  time: string
}

export async function listStoredAgencyRuns(
  owner: string,
  repo: string,
  limit: number,
): Promise<StoredAgencyRun[]> {
  return await createBackendClient().query(backendApi.agencyRuns.list, {
    tenantId: tenantIdFor(owner, repo),
    limit,
  }) as StoredAgencyRun[]
}

export async function listStoredRunEvents(
  owner: string,
  repo: string,
  runId: string,
): Promise<StoredRunEvent[]> {
  return await createBackendClient().query(backendApi.runEvents.listByRun, {
    tenantId: tenantIdFor(owner, repo),
    runId,
  }) as StoredRunEvent[]
}

export async function listStoredGoalRunEvents(
  owner: string,
  repo: string,
  goalId: string,
  limit: number,
): Promise<StoredRunEvent[]> {
  return await createBackendClient().query(backendApi.runEvents.listByGoal, {
    tenantId: tenantIdFor(owner, repo),
    goalId,
    limit,
  }) as StoredRunEvent[]
}
