import { v } from "convex/values";

// Shared document validators — the DB-enforced contract for stable platform
// shapes. Brand-defined / open payloads (user-state data, repo docs, view
// renderer definitions, event payloads, chat meta) intentionally stay v.any().

export const workflowTransitionValidator = v.object({
  to: v.string(),
  // Dashboard sends structured condition objects; legacy rows may hold strings.
  when: v.optional(v.union(v.string(), v.record(v.string(), v.any()))),
  default: v.optional(v.boolean()),
  maxIterations: v.optional(v.number()),
});

export const workflowStepValidator = v.object({
  id: v.string(),
  capability: v.string(),
  inputs: v.optional(v.record(v.string(), v.object({ from: v.string() }))),
  next: v.optional(v.array(workflowTransitionValidator)),
});

export const workflowDefinitionValidator = v.object({
  name: v.string(),
  agent: v.string(),
  capabilities: v.optional(v.array(v.string())),
  startAt: v.optional(v.string()),
  steps: v.optional(v.array(workflowStepValidator)),
  runWithoutApproval: v.optional(v.boolean()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
});

export const workflowRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("done"),
);

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
});

export const workflowRunnerValidator = v.object({
  kind: v.union(v.literal("pool"), v.literal("fly")),
  machineId: v.string(),
});

export const guidedFlowStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const macroValidator = v.object({
  id: v.string(),
  name: v.string(),
  // Dashboard stamps Unix-ms numbers; legacy rows may hold ISO strings.
  createdAt: v.optional(v.union(v.number(), v.string())),
  steps: v.optional(v.array(v.any())),
});

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
});
