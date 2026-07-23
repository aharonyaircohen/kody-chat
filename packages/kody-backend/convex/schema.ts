import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  companyIntentValidator,
  inboxEntryValidator,
  intentDecisionValidator,
  macroValidator,
  workflowDefinitionValidator,
  workflowRunStateValidator,
  workflowRunnerValidator,
  guidedFlowStatusValidator,
} from "./validators";
import {
  agentIdentityValidator,
  conversationAttachmentValidator,
  conversationEntryValidator,
  conversationRuntimeValidator,
  conversationScopeValidator,
} from "./conversationValidators";

// Every table is partitioned by `tenantId` ("owner/name" of the connected consumer
// tenantId) — the same scope the GitHub backend serves today. Per-user rows add
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
    runner: v.optional(workflowRunnerValidator),
    updatedAt: v.string(),
  })
    .index("by_run", ["tenantId", "workflowId", "runId"])
    .index("by_workflow", ["tenantId", "workflowId"]),

  guidedFlowInstances: defineTable({
    tenantId: v.string(),
    actorId: v.string(),
    instanceId: v.string(),
    instanceKey: v.optional(v.string()),
    flowId: v.string(),
    flowVersion: v.number(),
    currentStepId: v.string(),
    status: guidedFlowStatusValidator,
    revision: v.number(),
    data: v.any(),
    history: v.array(v.string()),
    updatedAt: v.string(),
    mutationId: v.optional(v.string()),
  })
    .index("by_instance", ["tenantId", "actorId", "instanceId"])
    .index("by_actor_status", ["tenantId", "actorId", "status"]),

  // Tenant widget bundles — precompiled browser components published from
  // the tenant repo (source/review in GitHub, serving copy here). One row
  // per published version; latest non-null wins.
  widgets: defineTable({
    tenantId: v.string(),
    slug: v.string(),
    version: v.number(),
    bundle: v.string(),
    commitSha: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_widget", ["tenantId", "slug", "version"]),

  // Custom GuidedFlow definitions — one row per flow version (append-only;
  // deletes append an archived tombstone version). Replaces the former
  // userState "guided-flow-definitions" blob array.
  guidedFlowDefinitions: defineTable({
    tenantId: v.string(),
    actorId: v.string(),
    flowId: v.string(),
    version: v.number(),
    archived: v.optional(v.boolean()),
    definition: v.any(),
    updatedAt: v.string(),
  })
    .index("by_flow", ["tenantId", "actorId", "flowId", "version"])
    .index("by_actor", ["tenantId", "actorId"]),

  // Append-only ledger of finished guided flows — one row per completed
  // instance, the per-user progress record (e.g. lesson completions).
  guidedFlowCompletions: defineTable({
    tenantId: v.string(),
    actorId: v.string(),
    instanceId: v.string(),
    flowId: v.string(),
    flowVersion: v.number(),
    completedAt: v.string(),
    data: v.any(),
  })
    .index("by_completion", ["tenantId", "actorId", "instanceId"])
    .index("by_actor", ["tenantId", "actorId", "completedAt"])
    .index("by_flow", ["tenantId", "flowId", "completedAt"]),

  userJourneys: defineTable({
    tenantId: v.string(),
    journeyId: v.string(),
    name: v.string(),
    goal: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("normal"),
    ),
    currentVersion: v.number(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "journeyId"]),

  userJourneyVersions: defineTable({
    tenantId: v.string(),
    journeyId: v.string(),
    version: v.number(),
    definition: v.any(),
    createdAt: v.string(),
  }).index("by_journey", ["tenantId", "journeyId", "version"]),

  userJourneyRuns: defineTable({
    tenantId: v.string(),
    journeyId: v.string(),
    runId: v.string(),
    version: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    environment: v.string(),
    commitSha: v.optional(v.string()),
    runnerVersion: v.optional(v.string()),
    startedAt: v.optional(v.string()),
    finishedAt: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_journey", ["tenantId", "journeyId", "createdAt"])
    .index("by_run", ["tenantId", "runId"]),

  userJourneyRunEvents: defineTable({
    tenantId: v.string(),
    runId: v.string(),
    seq: v.number(),
    event: v.any(),
    time: v.string(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_run", ["tenantId", "runId", "seq"])
    .index("by_idempotency", ["tenantId", "runId", "idempotencyKey"]),

  agencyRuns: defineTable({
    tenantId: v.string(),
    runId: v.string(),
    subjectType: v.union(
      v.literal("goal"),
      v.literal("loop"),
      v.literal("workflow"),
      v.literal("capability"),
    ),
    subjectId: v.string(),
    run: v.any(),
    updatedAt: v.string(),
  })
    .index("by_run", ["tenantId", "runId"])
    .index("by_tenant", ["tenantId", "updatedAt"]),

  runEvents: defineTable({
    tenantId: v.string(),
    runId: v.string(),
    goalId: v.optional(v.string()),
    seq: v.number(),
    event: v.any(),
    time: v.string(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_run", ["tenantId", "runId", "seq"])
    .index("by_goal", ["tenantId", "goalId", "time"])
    .index("by_idempotency", ["tenantId", "runId", "idempotencyKey"]),

  manifests: defineTable({
    tenantId: v.string(),
    kind: v.string(),
    doc: v.any(),
    updatedAt: v.string(),
  }).index("by_kind", ["tenantId", "kind"]),

  chatEvents: defineTable({
    tenantId: v.string(),
    sessionId: v.string(),
    seq: v.number(),
    event: v.any(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_session", ["tenantId", "sessionId", "seq"])
    // Tenant-wide newest-first scans (Activity feed's recent-session list) —
    // the implicit _creationTime suffix orders events by arrival.
    .index("by_tenant", ["tenantId"])
    .index("by_idempotency", ["tenantId", "sessionId", "idempotencyKey"]),

  conversations: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    surface: v.optional(
      v.union(v.literal("global"), v.literal("vibe-default")),
    ),
    scope: conversationScopeValidator,
    title: v.string(),
    preview: v.optional(v.string()),
    pinned: v.boolean(),
    activeAgent: agentIdentityValidator,
    runtime: conversationRuntimeValidator,
    createdBy: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_conversation", ["tenantId", "conversationId"])
    .index("by_tenant_updated", ["tenantId", "updatedAt"]),

  conversationEntries: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    entryId: v.string(),
    idempotencyKey: v.string(),
    seq: v.number(),
    entry: conversationEntryValidator,
    updatedAt: v.string(),
  })
    .index("by_conversation", ["tenantId", "conversationId", "seq"])
    .index("by_entry", ["tenantId", "conversationId", "entryId"])
    .index("by_idempotency", ["tenantId", "conversationId", "idempotencyKey"]),

  conversationTurns: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    turnId: v.string(),
    backend: v.union(
      v.literal("direct"),
      v.literal("brain"),
      v.literal("engine"),
      v.literal("live"),
    ),
    agent: agentIdentityValidator,
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    assistantEntryId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index("by_turn", ["tenantId", "conversationId", "turnId"])
    .index("by_conversation", ["tenantId", "conversationId", "startedAt"]),

  conversationCheckpoints: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    version: v.number(),
    throughSeq: v.number(),
    agentEpochId: v.string(),
    summary: v.string(),
    sourceHash: v.string(),
    createdAt: v.string(),
  }).index("by_conversation", ["tenantId", "conversationId", "version"]),

  conversationRuntimeBindings: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    runtimeKind: v.union(
      v.literal("direct"),
      v.literal("brain"),
      v.literal("engine"),
      v.literal("live"),
    ),
    runtime: conversationRuntimeValidator,
    remoteConversationId: v.string(),
    updatedAt: v.string(),
  }).index("by_conversation_runtime", [
    "tenantId",
    "conversationId",
    "runtimeKind",
  ]),

  conversationAttachments: defineTable({
    tenantId: v.string(),
    conversationId: v.string(),
    attachmentId: v.string(),
    attachment: conversationAttachmentValidator,
  })
    .index("by_conversation", ["tenantId", "conversationId"])
    .index("by_attachment", ["tenantId", "conversationId", "attachmentId"]),

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
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_intent", ["tenantId", "intentId", "seq"])
    .index("by_idempotency", ["tenantId", "intentId", "idempotencyKey"]),

  goals: defineTable({
    tenantId: v.string(),
    goalId: v.string(),
    state: v.any(), // ManagedGoalState
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "goalId"]),

  agencyDefinitions: defineTable({
    tenantId: v.string(),
    recordId: v.string(),
    kind: v.union(
      v.literal("intent"),
      v.literal("operation"),
      v.literal("goal"),
      v.literal("loop"),
      v.literal("workflow"),
      v.literal("capability"),
      v.literal("agent"),
    ),
    schemaVersion: v.number(),
    data: v.any(),
    createdAt: v.string(),
  }).index("by_tenant", ["tenantId", "recordId"]),

  agencyStates: defineTable({
    tenantId: v.string(),
    definitionId: v.string(),
    kind: v.union(v.literal("goal"), v.literal("loop")),
    schemaVersion: v.number(),
    data: v.any(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId", "kind", "definitionId"]),

  agencyOutputs: defineTable({
    tenantId: v.string(),
    recordId: v.string(),
    schemaVersion: v.number(),
    runId: v.string(),
    data: v.any(),
  })
    .index("by_tenant_record", ["tenantId", "recordId"])
    .index("by_tenant_run", ["tenantId", "runId"]),

  agencyDispatches: defineTable({
    tenantId: v.string(),
    idempotencyKey: v.string(),
    loopId: v.string(),
    decision: v.any(),
    status: v.union(
      v.literal("skipped"),
      v.literal("reserved"),
      v.literal("waiting-approval"),
      v.literal("waiting-capacity"),
      v.literal("dispatched"),
      v.literal("failed"),
      v.literal("dead-letter"),
    ),
    leaseUntil: v.optional(v.string()),
    reservationId: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    policyHash: v.optional(v.string()),
    effectivePolicy: v.optional(v.any()),
    definitionRefs: v.optional(v.array(v.any())),
    approvalId: v.optional(v.string()),
    runId: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_tenant_key", ["tenantId", "idempotencyKey"])
    .index("by_policy_status", ["tenantId", "policyHash", "status"]),

  agencyApprovals: defineTable({
    tenantId: v.string(),
    approvalId: v.string(),
    scopeKind: v.union(
      v.literal("loop"),
      v.literal("goal"),
      v.literal("workflow"),
      v.literal("capability"),
    ),
    scopeId: v.string(),
    action: v.string(),
    status: v.union(
      v.literal("available"),
      v.literal("consumed"),
      v.literal("revoked"),
    ),
    approvedBy: v.string(),
    approvedAt: v.string(),
    expiresAt: v.optional(v.string()),
    consumedAt: v.optional(v.string()),
    dispatchKey: v.optional(v.string()),
  })
    .index("by_approval_id", ["tenantId", "approvalId"])
    .index("by_scope", ["tenantId", "scopeKind", "scopeId", "status"])
    .index("by_tenant", ["tenantId", "approvedAt"]),

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

  // Legacy-compatible catalog records. Runtime definitions use the versioned
  // definition tables below; Store activation may still populate catalog
  // entries while older consumers transition.
  catalog: defineTable({
    tenantId: v.string(),
    category: v.union(
      v.literal("config"),
      v.literal("capability"),
      v.literal("agent"),
      v.literal("goal-template"),
      v.literal("workflow-template"),
      v.literal("capability-workflow"),
    ),
    slug: v.string(),
    doc: v.any(),
    source: v.string(),
    sourceUpdatedAt: v.optional(v.string()),
    updatedAt: v.string(),
  }).index("by_key", ["tenantId", "category", "slug"]),

  definitionHeads: defineTable({
    tenantId: v.string(),
    kind: v.union(
      v.literal("agent"),
      v.literal("capability"),
      v.literal("goal"),
    ),
    slug: v.string(),
    version: v.string(),
    bundle: v.any(),
    source: v.optional(v.union(v.literal("local"), v.literal("store"))),
    updatedAt: v.string(),
  }).index("by_key", ["tenantId", "kind", "slug"]),

  definitionVersions: defineTable({
    tenantId: v.string(),
    kind: v.union(
      v.literal("agent"),
      v.literal("capability"),
      v.literal("goal"),
    ),
    slug: v.string(),
    version: v.string(),
    bundle: v.any(),
    source: v.optional(v.union(v.literal("local"), v.literal("store"))),
    createdAt: v.string(),
  })
    .index("by_version", ["tenantId", "kind", "slug", "version"])
    .index("by_definition", ["tenantId", "kind", "slug", "createdAt"]),

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

  // One generated Knowledge System bundle per consumer repository. Large
  // Graphify artifacts live in Convex file storage; this row owns their
  // tenant boundary, provenance, and replacement lifecycle.
  knowledgeGraphs: defineTable({
    tenantId: v.string(),
    graphStorageId: v.id("_storage"),
    reportStorageId: v.optional(v.id("_storage")),
    htmlStorageId: v.optional(v.id("_storage")),
    generatedAt: v.string(),
    sourceRevision: v.optional(v.string()),
    nodeCount: v.number(),
    edgeCount: v.number(),
    schemaVersion: v.number(),
    updatedAt: v.string(),
  }).index("by_tenant", ["tenantId"]),

  userState: defineTable({
    tenantId: v.string(),
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  }).index("by_user", ["tenantId", "namespace", "userKey"]),

  userPreferences: defineTable({
    namespace: v.string(),
    userKey: v.string(),
    data: v.any(),
    updatedAt: v.string(),
  }).index("by_user", ["namespace", "userKey"]),

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
    kind: v.union(
      v.literal("observation"),
      v.literal("finding"),
      v.literal("learning"),
    ),
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
    stream: v.union(
      v.literal("activity"),
      v.literal("events"),
      v.literal("flyActivity"),
    ),
    date: v.string(), // YYYY-MM-DD
    seq: v.number(),
    entry: v.any(),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_stream", ["tenantId", "stream", "date", "seq"])
    .index("by_idempotency", ["tenantId", "stream", "date", "idempotencyKey"]),

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
});
