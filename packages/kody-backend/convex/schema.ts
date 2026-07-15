import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import {
  companyIntentValidator,
  inboxEntryValidator,
  intentDecisionValidator,
  macroValidator,
  workflowDefinitionValidator,
  workflowRunStateValidator,
} from "./validators"

// Every table is partitioned by `tenantId` ("owner/name" of the connected consumer
// tenantId) — the same scope the GitHub state repo serves today. Per-user rows add
// `login`. Flexible payloads stay v.any() so brand-defined shapes keep working;
// invariant fields are typed.
export default defineSchema({
  workflows: defineTable({
    tenantId: v.string(),
    workflowId: v.string(),
    definition: workflowDefinitionValidator,
    source: v.union(v.literal("local"), v.literal("store")),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "workflowId"]),

  workflowRuns: defineTable({
    tenantId: v.string(),
    workflowId: v.string(),
    runId: v.string(),
    state: workflowRunStateValidator,
    updatedAt: v.string(),
  })
    .index("by_run", ["tenantId", "workflowId", "runId"])
    .index("by_workflow", ["tenantId", "workflowId"]),

  chatSessions: defineTable({
    tenantId: v.string(),
    sessionId: v.string(),
    meta: v.any(), // SessionMeta (mode, createdAt, checkpoint, title…)
    updatedAt: v.string(),
  }).index("by_session", ["tenantId", "sessionId"]),

  chatTurns: defineTable({
    tenantId: v.string(),
    sessionId: v.string(),
    seq: v.number(),
    turn: v.any(), // ChatTurn / ChatMessage
  }).index("by_session", ["tenantId", "sessionId", "seq"]),

  chatEvents: defineTable({
    tenantId: v.string(),
    sessionId: v.string(),
    seq: v.number(),
    event: v.any(),
  }).index("by_session", ["tenantId", "sessionId", "seq"]),

  intents: defineTable({
    tenantId: v.string(),
    intentId: v.string(),
    intent: companyIntentValidator,
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "intentId"]),

  intentDecisions: defineTable({
    tenantId: v.string(),
    intentId: v.string(),
    seq: v.number(),
    decision: intentDecisionValidator,
  }).index("by_intent", ["tenantId", "intentId", "seq"]),

  goals: defineTable({
    tenantId: v.string(),
    goalId: v.string(),
    state: v.any(), // ManagedGoalState
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "goalId"]),

  reports: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    runId: v.optional(v.string()), // absent = top-level report doc
    title: v.optional(v.string()),
    body: v.string(),
    meta: v.any(), // producer, capabilitySlug, reportType…
    updatedAt: v.string(),
  })
    .index("by_slug", ["tenantId", "slug", "runId"])
    .index("by_tenant", ["tenantId"]),

  agents: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    frontmatter: v.any(),
    body: v.string(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "slug"]),

  viewRenderers: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    definition: v.any(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "slug"]),

  macros: defineTable({
    tenantId: v.string(),
    macroId: v.string(),
    macro: macroValidator,
  }).index("by_tenant", ["tenantId", "macroId"]),

  // Singleton per-tenant documents: dashboard.json, system-prompt.md, kody
  // context/instruction docs — keyed by `kind`.
  repoDocs: defineTable({
    tenantId: v.string(),
    kind: v.string(), // "dashboard-config" | "system-prompt" | "instructions" | "cto" | "context:<slug>" …
    doc: v.any(),
    updatedAt: v.string(),
  }).index("by_kind", ["tenantId", "kind"]),

  userState: defineTable({
    tenantId: v.string(),
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  }).index("by_user", ["tenantId", "namespace", "userKey"]),

  notificationPrefs: defineTable({
    tenantId: v.string(),
    login: v.string(),
    prefs: v.any(),
    updatedAt: v.string(),
  }).index("by_login", ["tenantId", "login"]),

  inboxEntries: defineTable({
    tenantId: v.string(),
    login: v.string(),
    entryId: v.string(),
    entry: inboxEntryValidator,
    readAt: v.optional(v.string()),
    sentAt: v.string(),
  })
    .index("by_login", ["tenantId", "login", "sentAt"])
    .index("by_entry", ["tenantId", "login", "entryId"]),

  channelsSeen: defineTable({
    tenantId: v.string(),
    login: v.string(),
    manifest: v.any(), // ChannelsSeenManifest
    updatedAt: v.string(),
  }).index("by_login", ["tenantId", "login"]),

  agencyRecords: defineTable({
    tenantId: v.string(),
    kind: v.union(v.literal("observation"), v.literal("finding"), v.literal("learning")),
    recordId: v.string(),
    doc: v.any(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "kind", "recordId"]),

  taskState: defineTable({
    tenantId: v.string(),
    taskKey: v.string(), // "2", "issues/2", "prs/3"
    kind: v.string(), // "context" | "state" | …
    doc: v.any(),
    updatedAt: v.string(),
  }).index("by_task", ["tenantId", "taskKey", "kind"]),

  capabilityState: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    state: v.any(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "slug"]),

  // Daily append-only streams (activity/<date>.jsonl, events/log/<date>.jsonl).
  dailyLogs: defineTable({
    tenantId: v.string(),
    stream: v.union(v.literal("activity"), v.literal("events")),
    date: v.string(), // YYYY-MM-DD
    seq: v.number(),
    entry: v.any(),
  }).index("by_stream", ["tenantId", "stream", "date", "seq"]),

  // Global (cross-repo) Kody engine store — replaces the Kody-Dashboard repo
  // action-state.json / event-log.jsonl.
  actionStates: defineTable({
    runId: v.string(),
    state: v.any(), // ActionState
    updatedAt: v.string(),
  }).index("by_run", ["runId"]),

  eventLog: defineTable({
    entryId: v.string(),
    runId: v.string(),
    event: v.string(),
    payload: v.any(),
    channel: v.optional(v.string()),
    emittedAt: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_emitted", ["emittedAt"]),
})
