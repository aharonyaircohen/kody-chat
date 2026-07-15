import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

// Every table is partitioned by `repo` ("owner/name" of the connected consumer
// repo) — the same scope the GitHub state repo serves today. Per-user rows add
// `login`. Flexible payloads stay v.any() so brand-defined shapes keep working;
// invariant fields are typed.
export default defineSchema({
  workflows: defineTable({
    repo: v.string(),
    workflowId: v.string(),
    definition: v.any(), // WorkflowDefinition (version 1)
    source: v.union(v.literal("local"), v.literal("store")),
    updatedAt: v.string(),
  }).index("by_repo", ["repo", "workflowId"]),

  workflowRuns: defineTable({
    repo: v.string(),
    workflowId: v.string(),
    runId: v.string(),
    state: v.any(), // WorkflowRunState
    updatedAt: v.string(),
  })
    .index("by_run", ["repo", "workflowId", "runId"])
    .index("by_workflow", ["repo", "workflowId"]),

  chatSessions: defineTable({
    repo: v.string(),
    sessionId: v.string(),
    meta: v.any(), // SessionMeta (mode, createdAt, checkpoint, title…)
    updatedAt: v.string(),
  }).index("by_session", ["repo", "sessionId"]),

  chatTurns: defineTable({
    repo: v.string(),
    sessionId: v.string(),
    seq: v.number(),
    turn: v.any(), // ChatTurn / ChatMessage
  }).index("by_session", ["repo", "sessionId", "seq"]),

  chatEvents: defineTable({
    repo: v.string(),
    sessionId: v.string(),
    seq: v.number(),
    event: v.any(),
  }).index("by_session", ["repo", "sessionId", "seq"]),

  intents: defineTable({
    repo: v.string(),
    intentId: v.string(),
    intent: v.any(), // CompanyIntent
    updatedAt: v.string(),
  }).index("by_repo", ["repo", "intentId"]),

  intentDecisions: defineTable({
    repo: v.string(),
    intentId: v.string(),
    seq: v.number(),
    decision: v.any(),
  }).index("by_intent", ["repo", "intentId", "seq"]),

  goals: defineTable({
    repo: v.string(),
    goalId: v.string(),
    state: v.any(), // ManagedGoalState
    updatedAt: v.string(),
  }).index("by_repo", ["repo", "goalId"]),

  reports: defineTable({
    repo: v.string(),
    slug: v.string(),
    runId: v.optional(v.string()), // absent = top-level report doc
    title: v.optional(v.string()),
    body: v.string(),
    meta: v.any(), // producer, capabilitySlug, reportType…
    updatedAt: v.string(),
  })
    .index("by_slug", ["repo", "slug", "runId"])
    .index("by_repo", ["repo"]),

  agents: defineTable({
    repo: v.string(),
    slug: v.string(),
    frontmatter: v.any(),
    body: v.string(),
    updatedAt: v.string(),
  }).index("by_repo", ["repo", "slug"]),

  viewRenderers: defineTable({
    repo: v.string(),
    slug: v.string(),
    definition: v.any(),
    updatedAt: v.string(),
  }).index("by_repo", ["repo", "slug"]),

  macros: defineTable({
    repo: v.string(),
    macroId: v.string(),
    macro: v.any(), // {id, name, createdAt, steps}
  }).index("by_repo", ["repo", "macroId"]),

  // Singleton per-repo documents: dashboard.json, system-prompt.md, kody
  // context/instruction docs — keyed by `kind`.
  repoDocs: defineTable({
    repo: v.string(),
    kind: v.string(), // "dashboard-config" | "system-prompt" | "instructions" | "cto" | "context:<slug>" …
    doc: v.any(),
    updatedAt: v.string(),
  }).index("by_kind", ["repo", "kind"]),

  userState: defineTable({
    repo: v.string(),
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  }).index("by_user", ["repo", "namespace", "userKey"]),

  notificationPrefs: defineTable({
    repo: v.string(),
    login: v.string(),
    prefs: v.any(),
    updatedAt: v.string(),
  }).index("by_login", ["repo", "login"]),

  inboxEntries: defineTable({
    repo: v.string(),
    login: v.string(),
    entryId: v.string(),
    entry: v.any(), // InboxEntry
    readAt: v.optional(v.string()),
    sentAt: v.string(),
  })
    .index("by_login", ["repo", "login", "sentAt"])
    .index("by_entry", ["repo", "login", "entryId"]),

  channelsSeen: defineTable({
    repo: v.string(),
    login: v.string(),
    manifest: v.any(), // ChannelsSeenManifest
    updatedAt: v.string(),
  }).index("by_login", ["repo", "login"]),

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
