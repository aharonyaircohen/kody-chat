import { createBackendClient } from "@kody-ade/backend/client"
import { api as backendApi } from "@kody-ade/backend/api"

function tenantIdFor(owner: string, repo: string): string {
  const tenantId = `${owner.trim()}/${repo.trim()}`
  if (!/^[^/\s]+\/[^/\s]+$/.test(tenantId)) throw new Error("Invalid tenant repository")
  return tenantId
}

export type StoredGoal = {
  id: string
  position?: number
  name: string
  description?: string
  dueDate?: string
  assignee?: string
  createdAt: string
  updatedAt: string
  discussionId?: string
  discussionNumber?: number
}

export async function listGoals(owner: string, repo: string): Promise<StoredGoal[]> {
  const rows = await createBackendClient().query(backendApi.goals.list, {
    tenantId: tenantIdFor(owner, repo),
  })
  return (rows as Array<{ goalId: string; state: unknown }>).flatMap((row) => {
    if (!row.state || typeof row.state !== "object" || Array.isArray(row.state)) return []
    const goal = row.state as StoredGoal
    return goal.id === row.goalId ? [goal] : []
  })
}

export async function saveGoal(owner: string, repo: string, goal: StoredGoal): Promise<void> {
  await createBackendClient().mutation(backendApi.goals.save, {
    tenantId: tenantIdFor(owner, repo),
    goalId: goal.id,
    state: goal,
    updatedAt: goal.updatedAt,
  })
}

export async function removeGoal(owner: string, repo: string, goalId: string): Promise<void> {
  await createBackendClient().mutation(backendApi.goals.remove, {
    tenantId: tenantIdFor(owner, repo),
    goalId,
  })
}
