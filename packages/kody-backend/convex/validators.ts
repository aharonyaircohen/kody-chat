import { v } from "convex/values"

// Shared document validators — the DB-enforced contract for stable platform
// shapes. Brand-defined / open payloads (user-state data, repo docs, view
// renderer definitions, event payloads, chat meta) intentionally stay v.any().

export const workflowTransitionValidator = v.object({
  to: v.string(),
  // Dashboard sends structured condition objects; legacy rows may hold strings.
  when: v.optional(v.union(v.string(), v.record(v.string(), v.any()))),
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

export const workflowRunnerValidator = v.object({
  kind: v.union(v.literal("pool"), v.literal("fly")),
  machineId: v.string(),
})

export const guidedFlowStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
)

export const macroValidator = v.object({
  id: v.string(),
  name: v.string(),
  // Dashboard stamps Unix-ms numbers; legacy rows may hold ISO strings.
  createdAt: v.optional(v.union(v.number(), v.string())),
  steps: v.optional(v.array(v.any())),
})

export const releaseCadenceValidator = v.union(
  v.literal("manual"),
  v.literal("15m"),
  v.literal("1d"),
  v.literal("1w"),
)

export const companyIntentValidator = v.object({
  version: v.literal(1),
  id: v.string(),
  status: v.union(v.literal("active"), v.literal("paused"), v.literal("archived")),
  for: v.string(),
  description: v.optional(v.string()),
  priority: v.number(),
  posture: v.union(
    v.literal("confidence"),
    v.literal("speed"),
    v.literal("stability-recovery"),
    v.literal("maintenance"),
    v.literal("balanced"),
  ),
  scope: v.object({ repos: v.array(v.string()), areas: v.array(v.string()) }),
  // Written by agency agents; not yet in the dashboard's CompanyIntent type.
  manager: v.optional(
    v.object({
      agent: v.string(),
      capability: v.string(),
      loop: v.string(),
      reviewEvery: v.string(),
    }),
  ),
  principles: v.array(v.string()),
  metrics: v.array(v.string()),
  policyRefs: v.array(v.string()),
  controls: v.object({
    release: v.optional(
      v.object({
        cadence: v.optional(releaseCadenceValidator),
        qaDepth: v.optional(
          v.union(v.literal("light"), v.literal("standard"), v.literal("strict")),
        ),
        blockerLevel: v.optional(
          v.union(v.literal("low"), v.literal("standard"), v.literal("strict")),
        ),
        approval: v.optional(
          v.union(
            v.literal("none"),
            v.literal("before-production"),
            v.literal("before-risky-actions"),
          ),
        ),
      }),
    ),
    automation: v.object({
      authority: v.literal("full-auto"),
      maxConcurrentGoals: v.number(),
      maxDailyActions: v.number(),
      requiresHumanFor: v.array(v.string()),
    }),
  }),
  portfolio: v.object({
    goals: v.array(v.string()),
    loops: v.array(v.string()),
    capabilities: v.array(v.string()),
  }),
  createdAt: v.string(),
  updatedAt: v.string(),
})

export const intentDecisionValidator = v.object({
  at: v.string(),
  agent: v.string(),
  intentId: v.optional(v.string()),
  action: v.string(),
  reason: v.string(),
  before: v.optional(v.any()),
  after: v.optional(v.any()),
  resources: v.optional(v.array(v.string())),
})

export const inboxEntryValidator = v.object({
  id: v.string(),
  source: v.union(
    v.literal("mention"),
    v.literal("comment"),
    v.literal("review_requested"),
    v.literal("assigned"),
    v.literal("team_mention"),
    v.literal("subscribed"),
    v.literal("request"),
    v.literal("other"),
  ),
  repoFullName: v.string(),
  threadType: v.string(),
  title: v.string(),
  snippet: v.string(),
  author: v.optional(v.string()),
  url: v.string(),
  sentAt: v.string(),
  readAt: v.union(v.string(), v.null()),
  ctoAction: v.optional(v.string()),
  ctoCommand: v.optional(v.string()),
  ctoAgent: v.optional(v.string()),
  ctoCapability: v.optional(v.string()),
  ctoRepo: v.optional(v.string()),
  category: v.optional(v.string()),
})
