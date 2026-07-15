import { v } from "convex/values"

// Shared document validators — the DB-enforced contract for stable platform
// shapes. Brand-defined / open payloads (user-state data, repo docs, view
// renderer definitions, event payloads, chat meta) intentionally stay v.any().

export const workflowTransitionValidator = v.object({
  to: v.string(),
  when: v.optional(v.string()),
  default: v.optional(v.boolean()),
  maxIterations: v.optional(v.number()),
})

export const workflowStepValidator = v.object({
  id: v.string(),
  capability: v.string(),
  inputs: v.optional(v.record(v.string(), v.object({ from: v.string() }))),
  next: v.optional(v.array(workflowTransitionValidator)),
})

export const workflowDefinitionValidator = v.object({
  version: v.literal(1),
  name: v.string(),
  capabilities: v.optional(v.array(v.string())),
  startAt: v.optional(v.string()),
  steps: v.optional(v.array(workflowStepValidator)),
  runWithoutApproval: v.optional(v.boolean()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
})

export const workflowRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("done"),
)

export const workflowRunStateValidator = v.object({
  status: workflowRunStatusValidator,
  currentStepId: v.optional(v.string()),
  completedStepIds: v.array(v.string()),
  transitionCounts: v.optional(v.record(v.string(), v.number())),
  facts: v.optional(v.record(v.string(), v.any())),
  evidence: v.optional(v.record(v.string(), v.boolean())),
  artifacts: v.optional(
    v.array(
      v.object({
        label: v.string(),
        url: v.optional(v.string()),
        path: v.optional(v.string()),
      }),
    ),
  ),
  blocker: v.optional(v.string()),
})

export const macroValidator = v.object({
  id: v.string(),
  name: v.string(),
  createdAt: v.optional(v.string()),
  steps: v.optional(v.array(v.any())),
})
